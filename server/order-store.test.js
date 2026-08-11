import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createOrderStore, shouldApplyStatus } from "./order-store.js";

test("does not regress a confirmed payment", () => {
  assert.equal(shouldApplyStatus("CONFIRMED", "AUTHORIZED"), false);
  assert.equal(shouldApplyStatus("CONFIRMED", "REFUNDED"), true);
  assert.equal(shouldApplyStatus("REFUNDED", "CONFIRMED"), false);
});

test("checks amount and payment id before changing an order", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smena-orders-"));
  const store = createOrderStore(path.join(directory, "orders.sqlite"));
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  store.create({
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
  });
  store.markInitialized("smena-test-1234567890", {
    paymentId: "123456",
    paymentUrl: "https://securepay.tinkoff.ru/example",
    status: "NEW",
  });

  assert.throws(
    () =>
      store.applyNotification({
        orderId: "smena-test-1234567890",
        paymentId: "123456",
        amount: 1,
        status: "CONFIRMED",
      }),
    { code: "PAYMENT_MISMATCH" },
  );

  store.applyNotification({
    orderId: "smena-test-1234567890",
    paymentId: "123456",
    amount: 4_000_000,
    status: "CONFIRMED",
  });
  store.applyNotification({
    orderId: "smena-test-1234567890",
    paymentId: "123456",
    amount: 4_000_000,
    status: "AUTHORIZED",
  });

  assert.equal(store.get("smena-test-1234567890").status, "CONFIRMED");
});
