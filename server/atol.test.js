import assert from "node:assert/strict";
import test from "node:test";
import { createAtolClient, createAtolSellDocument } from "./atol.js";

function config() {
  return {
    publicBaseUrl: "https://smena-academy.ru",
    atol: {
      login: "api-login",
      password: "api-password",
      groupCode: "group code",
      inn: "501723052937",
      companyEmail: "receipt@example.ru",
      vat: "none",
      sno: "usn_income",
      apiBaseUrl: "https://online.atol.ru/possystem/v4",
      timeoutMs: 1000,
    },
  };
}

function order() {
  return {
    order_id: "smena-test-1234567890",
    program_title: "Бармен",
    amount: 4_000_000,
    customer_email: "anna@example.ru",
  };
}

test("builds an ATOL v4 full prepayment receipt in rubles", () => {
  const document = createAtolSellDocument({
    config: config(),
    order: order(),
    now: new Date("2026-09-02T09:34:56Z"),
  });

  assert.equal(document.external_id, "sell-smena-test-1234567890");
  assert.equal(document.timestamp, "02.09.2026 12:34:56");
  assert.deepEqual(document.receipt.company, {
    email: "receipt@example.ru",
    inn: "501723052937",
    payment_address: "https://smena-academy.ru",
    sno: "usn_income",
  });
  assert.deepEqual(document.receipt.items[0], {
    name: "Предоплата 100% за информационно-консультационные услуги «Бармен»",
    price: 40_000,
    quantity: 1,
    sum: 40_000,
    measurement_unit: "услуга",
    payment_method: "full_prepayment",
    payment_object: "payment",
    vat: { type: "none" },
  });
  assert.deepEqual(document.receipt.payments, [{ type: 1, sum: 40_000 }]);
  assert.equal(document.receipt.total, 40_000);
  assert.equal(document.receipt.internet, true);
});

test("builds an ATOL v4 installment receipt as full payment on credit", () => {
  const document = createAtolSellDocument({
    config: config(),
    order: {
      ...order(),
      payment_source: "installment",
      first_payment_kopecks: 500_000,
    },
    now: new Date("2026-09-02T09:34:56Z"),
  });

  assert.equal(document.receipt.items[0].payment_method, "full_payment");
  assert.equal(document.receipt.items[0].payment_object, "service");
  assert.deepEqual(document.receipt.payments, [
    { type: 1, sum: 5_000 },
    { type: 3, sum: 35_000 },
  ]);
  assert.equal(document.receipt.total, 40_000);
});

test("uses the Token header and refreshes an expired ATOL token once", async () => {
  const calls = [];
  const responses = [
    { token: "old-token", error: null },
    { status: "fail", error: { code: 11, type: "system", text: "expired" } },
    { token: "new-token", error: null },
    { uuid: "2ea26f17-0884-4f08-b120-306fc096a58f", status: "wait", error: null },
  ];
  const fetchImplementation = async (url, options) => {
    calls.push({ url, options });
    const payload = responses.shift();
    return new Response(JSON.stringify(payload), {
      status: payload?.error?.code === 11 ? 401 : 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createAtolClient(config(), fetchImplementation);
  const result = await client.registerSell(order());

  assert.equal(result.status, "wait");
  assert.equal(calls.length, 4);
  assert.equal(calls[1].options.headers.Token, "old-token");
  assert.equal(calls[3].options.headers.Token, "new-token");
  assert.match(calls[1].url, /\/possystem\/v4\/group%20code\/sell$/);
});
