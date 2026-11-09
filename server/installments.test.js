import assert from "node:assert/strict";
import test from "node:test";
import {
  InstallmentApiError,
  createInstallmentClient,
  isTbankInstallmentWebhookIp,
  validateInstallmentInfo,
} from "./installments.js";

function config() {
  return {
    publicBaseUrl: "https://smena-academy.ru",
    installments: {
      shopId: "shop-id",
      showcaseId: "showcase-id",
      apiPassword: "api-password",
      apiBaseUrl: "https://forma.tbank.ru/api/partners/v2",
      timeoutMs: 1000,
    },
  };
}

function order() {
  return {
    orderId: "smena-test-1234567890",
    order_id: "smena-test-1234567890",
    amount: 4_000_000,
  };
}

test("creates a server-tracked installment application with webhook and return links", async () => {
  let request;
  const client = createInstallmentClient(config(), async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({
        id: "application-id",
        link: "https://forma.tbank.ru/example",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  const result = await client.createApplication({
    order: order(),
    program: { id: "bartender", title: "Бармен" },
    customer: {
      name: "Анна Иванова",
      phone: "+79990000000",
      email: "anna@example.ru",
    },
    promoCode: "installment_0_0_6_8,6",
  });

  assert.equal(request.url, "https://forma.tbank.ru/api/partners/v2/orders/create");
  assert.equal(request.body.orderNumber, order().orderId);
  assert.equal(
    request.body.webhookURL,
    "https://smena-academy.ru/api/installments/notification",
  );
  assert.equal(request.body.sum, 40_000);
  assert.equal(request.body.items[0].price, 40_000);
  assert.equal(request.body.demoFlow, undefined);
  assert.equal(result.applicationId, "application-id");
});

test("uses Basic Auth for Info and accepts only a real committed signed application", async () => {
  let request;
  const client = createInstallmentClient(config(), async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        id: order().order_id,
        status: "signed",
        demo: false,
        committed: true,
        first_payment: 0,
        order_amount: 40_000,
        product: "installment_credit",
        term: 6,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  const info = await client.getInfo(order().order_id);
  const expectedAuth = Buffer.from("showcase-id:api-password").toString("base64");
  assert.equal(request.options.headers.Authorization, `Basic ${expectedAuth}`);
  assert.equal(validateInstallmentInfo(info, order()).finalized, true);

  assert.equal(
    validateInstallmentInfo({ ...info, committed: false }, order()).finalized,
    false,
  );
  assert.throws(
    () => validateInstallmentInfo({ ...info, order_amount: 1 }, order()),
    InstallmentApiError,
  );
  assert.throws(
    () => validateInstallmentInfo({ ...info, demo: true }, order()),
    InstallmentApiError,
  );
});

test("recognizes only T-Bank's documented webhook network hosts", () => {
  assert.equal(isTbankInstallmentWebhookIp("91.194.226.1"), true);
  assert.equal(isTbankInstallmentWebhookIp("91.194.227.254"), true);
  assert.equal(isTbankInstallmentWebhookIp("91.194.226.0"), false);
  assert.equal(isTbankInstallmentWebhookIp("91.194.228.1"), false);
  assert.equal(isTbankInstallmentWebhookIp("127.0.0.1"), false);
});
