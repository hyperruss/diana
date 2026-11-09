import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createOrderStore } from "./order-store.js";
import { createReceiptService } from "./receipt-service.js";

test("durably submits a queued receipt for a confirmed payment", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smena-receipt-"));
  const store = createOrderStore(path.join(directory, "orders.sqlite"));
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const orderId = "smena-receipt-1234567890";
  store.create({
    orderId,
    programId: "bartender",
    programTitle: "Бармен",
    amount: 4_000_000,
    customer: {
      name: "Анна Иванова",
      phone: "+79990000000",
      email: "anna@example.ru",
    },
    consents: { offer: true, personalData: true, privacy: true },
  });
  store.markInitialized(orderId, {
    paymentId: "123456",
    paymentUrl: "https://securepay.tinkoff.ru/example",
    status: "NEW",
  });
  const confirmed = store.applyNotification({
    orderId,
    paymentId: "123456",
    amount: 4_000_000,
    status: "CONFIRMED",
  });
  store.queueSellReceipt(orderId);

  let submittedOrder;
  const service = createReceiptService({
    config: {
      publicBaseUrl: "https://smena-academy.ru",
      atol: {
        login: "login",
        password: "password",
        groupCode: "group",
        inn: "501723052937",
        companyEmail: "receipt@example.ru",
        vat: "none",
        sno: "",
        workerIntervalMs: 60_000,
      },
    },
    store,
    client: {
      async registerSell(order) {
        submittedOrder = order;
        return {
          externalId: `sell-${order.order_id}`,
          uuid: "2ea26f17-0884-4f08-b120-306fc096a58f",
          status: "wait",
        };
      },
      async getReport() {
        throw new Error("not due");
      },
    },
  });

  assert.equal(confirmed.status, "CONFIRMED");
  await service.runOnce();
  assert.equal(submittedOrder.order_id, orderId);
  assert.equal(store.getFiscalReceipt(orderId).status, "WAIT");
});
