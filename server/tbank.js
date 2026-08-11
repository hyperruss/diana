import { createHash, timingSafeEqual } from "node:crypto";

const isPrimitive = (value) =>
  value !== null &&
  value !== undefined &&
  (typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean");

export function createTbankToken(parameters, password) {
  const rootParameters = Object.entries({ ...parameters, Password: password })
    .filter(([key, value]) => key !== "Token" && isPrimitive(value))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  const source = rootParameters.map(([, value]) => String(value)).join("");
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function verifyTbankToken(parameters, password) {
  const received = String(parameters.Token || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;

  const expected = createTbankToken(parameters, password);
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function initializeTbankPayment({
  config,
  order,
  program,
  customer,
  fetchImplementation = fetch,
}) {
  const resultUrl = `${config.publicBaseUrl}/payment/result?orderId=${encodeURIComponent(order.orderId)}`;
  const request = {
    TerminalKey: config.tbank.terminalKey,
    Amount: order.amount,
    OrderId: order.orderId,
    Description: `Обучение по программе «${program.title}»`,
    PayType: "O",
    Language: "ru",
    NotificationURL: `${config.publicBaseUrl}/api/payments/notification`,
    SuccessURL: `${resultUrl}&result=success`,
    FailURL: `${resultUrl}&result=fail`,
    DATA: {
      Phone: customer.phone,
      Email: customer.email,
    },
  };

  request.Token = createTbankToken(request, config.tbank.password);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.tbank.timeoutMs);

  let response;
  try {
    response = await fetchImplementation(`${config.tbank.apiBaseUrl}/Init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`T-Bank Init returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (
    payload.Success !== true ||
    !payload.PaymentId ||
    !payload.PaymentURL ||
    String(payload.OrderId) !== order.orderId ||
    Number(payload.Amount) !== order.amount ||
    (payload.TerminalKey && payload.TerminalKey !== config.tbank.terminalKey)
  ) {
    const error = new Error("T-Bank rejected or returned an invalid Init response.");
    error.bankCode = String(payload.ErrorCode || "UNKNOWN");
    throw error;
  }

  const paymentUrl = new URL(payload.PaymentURL);
  if (paymentUrl.protocol !== "https:") {
    throw new Error("T-Bank returned a non-HTTPS payment URL.");
  }

  return {
    paymentId: String(payload.PaymentId),
    paymentUrl: paymentUrl.toString(),
    status: String(payload.Status || "NEW"),
  };
}
