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
  };
  let receivedOrder;
  const server = createPaymentServer({
    config,
    store,
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
});
