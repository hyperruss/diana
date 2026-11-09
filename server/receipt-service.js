import { AtolApiError, createAtolClient } from "./atol.js";
import { isAtolConfigured } from "./config.js";

export function createReceiptService({ config, store, client } = {}) {
  const configured = isAtolConfigured(config);
  const atolClient = configured ? client || createAtolClient(config) : null;
  let timer = null;
  let running = false;

  async function submitNext() {
    const receipt = store.nextReceiptToSubmit();
    if (!receipt) return false;
    const order = store.getReceiptOrder(receipt.external_id);
    if (!order || order.status !== "CONFIRMED") return false;

    try {
      const submission = await atolClient.registerSell(
        order,
        new Date(receipt.created_at),
      );
      if (submission.externalId !== receipt.external_id) {
        throw new AtolApiError("ATOL receipt external_id mismatch.", {
          retryable: false,
        });
      }
      store.markReceiptSubmitted(receipt.external_id, submission);
    } catch (error) {
      const apiError =
        error instanceof AtolApiError
          ? error
          : new AtolApiError(error?.message || "ATOL request failed.");
      store.markReceiptProblem(receipt.external_id, apiError, apiError.retryable);
      console.error("ATOL receipt submission failed", {
        externalId: receipt.external_id,
        atolCode: apiError.atolCode,
        retryable: apiError.retryable,
      });
    }
    return true;
  }

  async function checkNext() {
    const receipt = store.nextReceiptToCheck();
    if (!receipt?.uuid) return false;
    try {
      const report = await atolClient.getReport(receipt.uuid);
      store.markReceiptResult(receipt.external_id, report);
      if (report.status === "fail") {
        console.error("ATOL receipt fiscalization failed", {
          externalId: receipt.external_id,
          atolCode: report.errorCode,
        });
      }
    } catch (error) {
      console.error("ATOL receipt status check failed", {
        externalId: receipt.external_id,
        error: error?.name || "Error",
      });
    }
    return true;
  }

  async function runOnce() {
    if (!configured || running) return;
    running = true;
    try {
      await submitNext();
      await checkNext();
    } finally {
      running = false;
    }
  }

  return {
    configured,

    start() {
      if (!configured || timer) return;
      void runOnce();
      timer = setInterval(() => void runOnce(), config.atol.workerIntervalMs);
      timer.unref?.();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },

    queueSale(order) {
      const receipt = store.queueSellReceipt(order.order_id);
      if (configured) setImmediate(() => void runOnce());
      return receipt;
    },

    runOnce,
  };
}
