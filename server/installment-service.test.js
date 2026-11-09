import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createInstallmentService } from "./installment-service.js";
import { createOrderStore } from "./order-store.js";

function createFixture(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smena-installment-"));
  const store = createOrderStore(path.join(directory, "orders.sqlite"));
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const order = {
    orderId: "smena-test-1234567890",
    programId: "bartender",
    programTitle: "Бармен",
    amount: 4_000_000,
    customer: {
      name: "Анна Иванова",
      phone: "+79990000000",
      email: "anna@example.ru",
    },
    consents: { offer: true, personalData: true, privacy: true },
  };
  store.createInstallment(order, {
    promoCode: "installment_0_0_6_8,6",
    term: 6,
  });
  store.markInstallmentInitialized(order.orderId, {
    applicationId: "application-id",
    applicationUrl: "https://forma.tbank.ru/example",
  });
  return { store, order };
}

function config() {
  return {
    installments: {
      shopId: "shop-id",
      showcaseId: "showcase-id",
      apiPassword: "api-password",
      promoOptions: [
        { text: "На 6 месяцев", term: 6, value: "installment_0_0_6_8,6" },
      ],
      workerIntervalMs: 300_000,
    },
  };
}

test("queues an ATOL receipt only after Info reports signed and committed", async (context) => {
  const { store, order } = createFixture(context);
  const queued = [];
  const responses = [
    {
      id: order.orderId,
      status: "signed",
      demo: false,
      committed: false,
      first_payment: 0,
      order_amount: 40_000,
      product: "installment_credit",
      term: 6,
    },
    {
      id: order.orderId,
      status: "signed",
      demo: false,
      committed: true,
      first_payment: 0,
      order_amount: 40_000,
      product: "installment_credit",
      term: 6,
      loan_number: "loan-1",
      chosen_bank: "Т-Банк",
    },
  ];
  const service = createInstallmentService({
    config: config(),
    store,
    receiptService: { queueSale: (value) => queued.push(value) },
    client: { getInfo: async () => responses.shift() },
  });

  await service.syncOrder(order.orderId);
  assert.equal(store.get(order.orderId).status, "INSTALLMENT_SIGNED");
  assert.equal(queued.length, 0);

  await service.syncOrder(order.orderId);
  assert.equal(store.get(order.orderId).status, "CONFIRMED");
  assert.equal(queued.length, 1);
  assert.equal(queued[0].order_id, order.orderId);
  assert.equal(store.getInstallmentOrder(order.orderId).installment_committed, 1);
});
