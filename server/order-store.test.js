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

  const receipt = store.queueSellReceipt("smena-test-1234567890");
  assert.equal(receipt.external_id, "sell-smena-test-1234567890");
  assert.equal(receipt.status, "PENDING");
  assert.equal(store.nextReceiptToSubmit().external_id, receipt.external_id);

  store.markReceiptSubmitted(receipt.external_id, {
    uuid: "2ea26f17-0884-4f08-b120-306fc096a58f",
    status: "wait",
  });
  assert.equal(store.getFiscalReceipt("smena-test-1234567890").status, "WAIT");
});

test("persists installment verification data and exposes it to ATOL", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smena-orders-"));
  const store = createOrderStore(path.join(directory, "orders.sqlite"));
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const orderId = "smena-installment-1234567890";
  store.createInstallment(
    {
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
    },
    { promoCode: "installment_0_0_6_8,6", term: 6 },
  );
  store.markInstallmentInitialized(orderId, {
    applicationId: "application-id",
    applicationUrl: "https://forma.tbank.ru/example",
  });
  const confirmed = store.applyInstallmentInfo(orderId, {
    status: "signed",
    committed: true,
    firstPaymentKopecks: 500_000,
    term: 6,
    loanNumber: "loan-1",
    chosenBank: "Т-Банк",
    finalized: true,
  });
  assert.equal(confirmed.status, "CONFIRMED");

  const receipt = store.queueSellReceipt(orderId);
  const receiptOrder = store.getReceiptOrder(receipt.external_id);
  assert.equal(receiptOrder.payment_source, "installment");
  assert.equal(receiptOrder.first_payment_kopecks, 500_000);
});
