import {
  InstallmentApiError,
  createInstallmentClient,
  validateInstallmentInfo,
} from "./installments.js";
import { isInstallmentsConfigured } from "./config.js";

export function createInstallmentService({
  config,
  store,
  receiptService,
  client,
} = {}) {
  const configured = isInstallmentsConfigured(config);
  const installmentClient = configured
    ? client || createInstallmentClient(config)
    : null;
  let timer = null;
  let running = false;

  async function syncOrder(orderId) {
    const order = store.getInstallmentOrder(orderId);
    if (!order) {
      const error = new Error("Unknown installment order.");
      error.code = "UNKNOWN_INSTALLMENT_ORDER";
      throw error;
    }

    try {
      const info = await installmentClient.getInfo(orderId);
      const verified = validateInstallmentInfo(info, order);
      const updated = store.applyInstallmentInfo(orderId, verified);
      if (verified.finalized) receiptService.queueSale(updated);
      return updated;
    } catch (error) {
      const apiError =
        error instanceof InstallmentApiError
          ? error
          : new InstallmentApiError(
              error?.message || "Installments Info request failed.",
            );
      store.markInstallmentSyncProblem(orderId, apiError);
      throw apiError;
    }
  }

  async function runOnce() {
    if (!configured || running) return;
    running = true;
    try {
      for (let index = 0; index < 10; index += 1) {
        const order = store.nextInstallmentToCheck();
        if (!order) break;
        try {
          await syncOrder(order.order_id);
        } catch (error) {
          console.error("Installment status synchronization failed", {
            orderId: order.order_id,
            error: error.name,
            httpStatus: error.httpStatus || null,
          });
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    configured,
    createApplication(input) {
      return installmentClient.createApplication(input);
    },
    syncOrder,
    runOnce,

    start() {
      if (!configured || timer) return;
      void runOnce();
      timer = setInterval(
        () => void runOnce(),
        config.installments.workerIntervalMs,
      );
      timer.unref?.();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
