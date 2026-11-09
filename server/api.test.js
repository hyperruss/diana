import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPaymentServer } from "./index.js";
import { createOrderStore } from "./order-store.js";
import { createTbankToken } from "./tbank.js";

test("initializes an order at the server price and confirms it by signed notification", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smena-api-"));
  const store = createOrderStore(path.join(directory, "orders.sqlite"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicBaseUrl: "https://smena-academy.ru",
    tbank: {
      terminalKey: "TEST_TERMINAL",
      password: "TEST_PASSWORD",
      apiBaseUrl: "https://securepay.tinkoff.ru/v2",
      timeoutMs: 1000,
    },
    installments: {
      shopId: "shop-test",
      showcaseId: "showcase-test",
      apiPassword: "api-password",
      apiBaseUrl: "https://forma.tbank.ru/api/partners/v2",
      timeoutMs: 1000,
      workerIntervalMs: 300_000,
      promoOptions: [
        { text: "На 6 месяцев", term: 6, value: "installment_0_0_6_8,6" },
        { text: "На 12 месяцев", term: 12, value: "installment_0_0_12_15,2" },
      ],
    },
  };
  let receivedOrder;
  const server = createPaymentServer({
    config,
    store,
    receiptService: {
      configured: true,
      queueSale() {},
    },
    initializePayment: async ({ order }) => {
      receivedOrder = order;
      return {
        paymentId: "987654321",
        paymentUrl: "https://securepay.tinkoff.ru/example",
        status: "NEW",
      };
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const installmentResponse = await fetch(
    `${baseUrl}/api/installments/config?programId=bartender`,
  );
  const installment = await installmentResponse.json();
  assert.equal(installmentResponse.status, 200);
  assert.equal(installment.available, true);
  assert.deepEqual(installment.promoOptions, [
    { text: "На 6 месяцев", term: 6 },
    { text: "На 12 месяцев", term: 12 },
  ]);
  assert.equal(installment.itemName, "Обучение по программе «Бармен»");
  assert.equal(installment.amount, 40_000);

  const initResponse = await fetch(`${baseUrl}/api/payments/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      programId: "bartender",
      amount: 1,
      name: "Анна Иванова",
      phone: "+79990000000",
      email: "anna@example.ru",
      consents: {
        offer: true,
        personalData: true,
        privacy: true,
        marketing: false,
      },
    }),
  });
  const initialized = await initResponse.json();

  assert.equal(initResponse.status, 201);
  assert.equal(receivedOrder.amount, 4_000_000);
  assert.match(initialized.orderId, /^smena-/);

  const notification = {
    TerminalKey: config.tbank.terminalKey,
    OrderId: initialized.orderId,
    Success: true,
    Status: "CONFIRMED",
    PaymentId: "987654321",
    ErrorCode: "0",
    Amount: "4000000",
  };
  notification.Token = createTbankToken(notification, config.tbank.password);

  const forgedResponse = await fetch(
    `${baseUrl}/api/payments/notification`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...notification, Token: "0".repeat(64) }),
    },
  );
  assert.equal(forgedResponse.status, 403);

  const notificationResponse = await fetch(
    `${baseUrl}/api/payments/notification`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notification),
    },
  );
  assert.equal(notificationResponse.status, 200);
  assert.equal(await notificationResponse.text(), "OK");

  const statusResponse = await fetch(
    `${baseUrl}/api/payments/status?orderId=${initialized.orderId}`,
  );
  const status = await statusResponse.json();
  assert.equal(status.status, "CONFIRMED");
  assert.equal(status.confirmed, true);
  assert.equal(status.receiptStatus, "PENDING");
});

test("does not start card or installment checkout without fiscal receipts", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smena-api-receipts-"));
  const store = createOrderStore(path.join(directory, "orders.sqlite"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicBaseUrl: "https://smena-academy.ru",
    tbank: { terminalKey: "TEST_TERMINAL", password: "TEST_PASSWORD" },
    installments: {
      shopId: "shop-test",
      showcaseId: "showcase-test",
      apiPassword: "api-password",
      promoOptions: [{ text: "6 months", term: 6, value: "installment_0_0_6_8,6" }],
    },
  };
  const server = createPaymentServer({
    config,
    store,
    receiptService: { configured: false },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const cardResponse = await fetch(`${baseUrl}/api/payments/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(cardResponse.status, 503);

  const installmentResponse = await fetch(
    `${baseUrl}/api/installments/config?programId=bartender`,
  );
  assert.equal(installmentResponse.status, 503);
});

test("shows installment terms but cannot create an application before the API password is set", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smena-api-installment-"));
  const store = createOrderStore(path.join(directory, "orders.sqlite"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicBaseUrl: "https://smena-academy.ru",
    tbank: { terminalKey: "", password: "" },
    installments: {
      shopId: "shop-test",
      showcaseId: "showcase-test",
      apiPassword: "",
      promoOptions: [{ text: "На 6 месяцев", term: 6, value: "installment_0_0_6_8,6" }],
    },
  };
  const server = createPaymentServer({
    config,
    store,
    receiptService: { configured: true },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const optionsResponse = await fetch(
    `${baseUrl}/api/installments/config?programId=bartender`,
  );
  assert.equal(optionsResponse.status, 200);
  const options = await optionsResponse.json();
  assert.equal(options.available, false);
  assert.deepEqual(options.promoOptions, [{ text: "На 6 месяцев", term: 6 }]);

  const initResponse = await fetch(`${baseUrl}/api/installments/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(initResponse.status, 503);
});
