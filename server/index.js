import http from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { findPaymentProgram } from "./catalog.js";
import {
  assertTbankConfigured,
  isAtolConfigured,
  isInstallmentsConfigured,
  readConfig,
} from "./config.js";
import { createOrderStore } from "./order-store.js";
import { createReceiptService } from "./receipt-service.js";
import { createInstallmentService } from "./installment-service.js";
import { isTbankInstallmentWebhookIp } from "./installments.js";
import {
  initializeTbankPayment,
  verifyTbankToken,
} from "./tbank.js";
import { validatePaymentInput } from "./validation.js";

const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 8;

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function text(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = false;

    req.on("data", (chunk) => {
      if (oversized) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        oversized = true;
        const error = new Error("Request body is too large.");
        error.code = "BODY_TOO_LARGE";
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!oversized) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function parseBody(req, rawBody) {
  const contentType = String(req.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType === "application/json") {
    return JSON.parse(rawBody || "{}");
  }
  if (contentType === "application/x-www-form-urlencoded") {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  const error = new Error("Unsupported content type.");
  error.code = "UNSUPPORTED_CONTENT_TYPE";
  throw error;
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",", 1)[0]
    .trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function createRateLimiter() {
  const attempts = new Map();

  return (key) => {
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
    );
    recent.push(now);
    attempts.set(key, recent);

    if (attempts.size > 5_000) {
      for (const [candidate, timestamps] of attempts) {
        if (!timestamps.some((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS)) {
          attempts.delete(candidate);
        }
      }
    }

    return recent.length <= RATE_LIMIT_MAX;
  };
}

function createOrderId() {
  return `smena-${Date.now().toString(36)}-${randomBytes(12).toString("hex")}`;
}

function publicOrder(order, receipt = null) {
  return {
    orderId: order.order_id,
    programId: order.program_id,
    programTitle: order.program_title,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    confirmed: order.status === "CONFIRMED",
    receiptStatus: receipt?.status || null,
    receiptUrl: receipt?.receipt_url || null,
    terminal: [
      "CONFIRMED",
      "CANCELED",
      "REVERSED",
      "REFUNDED",
      "REJECTED",
      "DEADLINE_EXPIRED",
      "ATTEMPTS_EXPIRED",
      "INIT_FAILED",
    ].includes(order.status),
  };
}

export function createPaymentServer(options = {}) {
  const config = options.config ?? readConfig();
  const store = options.store ?? createOrderStore(config.orderDbPath);
  const initializePayment = options.initializePayment ?? initializeTbankPayment;
  const receiptService =
    options.receiptService ?? createReceiptService({ config, store });
  const installmentService =
    options.installmentService ??
    createInstallmentService({ config, store, receiptService });
  const allowInit = createRateLimiter();

  receiptService.start?.();
  installmentService.start?.();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    try {
      if (
        req.method === "GET" &&
        url.pathname === "/api/installments/config"
      ) {
        const program = findPaymentProgram(
          url.searchParams.get("programId") || "",
        );
        if (!program) {
          json(res, 404, { error: "Программа не найдена." });
          return;
        }
        if (program.enrollmentClosed) {
          json(res, 409, { error: "Набор на эту программу закрыт." });
          return;
        }
        if (
          !config.installments.shopId ||
          !config.installments.showcaseId ||
          !config.installments.promoOptions.length ||
          !receiptService.configured
        ) {
          json(res, 503, { error: "Оплата в рассрочку временно недоступна." });
          return;
        }

        json(res, 200, {
          available: installmentService.configured,
          promoOptions: config.installments.promoOptions.map(({ text, term }) => ({
            text,
            term,
          })),
          itemName: `Обучение по программе «${program.title}»`,
          amount: program.amount / 100,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/installments/init") {
        if (!allowInit(`installment:${clientIp(req)}`)) {
          json(res, 429, { error: "Слишком много попыток. Попробуйте позже." });
          return;
        }
        if (!installmentService.configured || !receiptService.configured) {
          json(res, 503, {
            error: "Оплата в рассрочку временно недоступна.",
          });
          return;
        }

        const rawInput = parseBody(req, await readBody(req));
        const input = validatePaymentInput(rawInput);
        if (!input.valid) {
          json(res, 400, { error: input.message });
          return;
        }
        const term = Number(rawInput.installmentTerm);
        const promo = config.installments.promoOptions.find(
          (option) => option.term === term,
        );
        if (!promo) {
          json(res, 400, { error: "Выберите доступный срок рассрочки." });
          return;
        }

        const program = findPaymentProgram(input.value.programId);
        if (!program) {
          json(res, 404, { error: "Программа не найдена." });
          return;
        }
        if (program.enrollmentClosed) {
          json(res, 409, { error: "Набор на эту программу закрыт." });
          return;
        }

        const order = {
          orderId: createOrderId(),
          programId: program.id,
          programTitle: program.title,
          amount: program.amount,
          customer: input.value,
          consents: input.value.consents,
        };
        store.createInstallment(order, {
          promoCode: promo.value,
          term: promo.term,
        });

        try {
          const application = await installmentService.createApplication({
            order,
            program,
            customer: input.value,
            promoCode: promo.value,
          });
          store.markInstallmentInitialized(order.orderId, application);
          json(res, 201, {
            orderId: order.orderId,
            applicationUrl: application.applicationUrl,
          });
        } catch (error) {
          store.markInstallmentInitFailed(order.orderId, error.httpStatus);
          console.error("Installment application initialization failed", {
            orderId: order.orderId,
            error: error.name,
            httpStatus: error.httpStatus || null,
          });
          json(res, 502, {
            error: "Т‑Банк не смог создать заявку на рассрочку. Попробуйте позже.",
          });
        }
        return;
      }

      if (
        req.method === "POST" &&
        url.pathname === "/api/installments/notification"
      ) {
        const sourceIp = String(req.headers["x-real-ip"] || "").trim();
        if (!isTbankInstallmentWebhookIp(sourceIp)) {
          text(res, 403, "Invalid source");
          return;
        }
        if (!installmentService.configured || !receiptService.configured) {
          text(res, 503, "Service unavailable");
          return;
        }
        const notification = parseBody(req, await readBody(req));
        const orderId =
          typeof notification.id === "string" ? notification.id : "";
        if (!/^smena-[a-z0-9-]{10,45}$/.test(orderId)) {
          text(res, 400, "Invalid order");
          return;
        }
        if (!store.getInstallmentOrder(orderId)) {
          text(res, 404, "Unknown order");
          return;
        }

        await installmentService.syncOrder(orderId);
        text(res, 200, "OK");
        return;
      }

      if (
        req.method === "GET" &&
        url.pathname === "/api/installments/status"
      ) {
        const orderId = url.searchParams.get("orderId") || "";
        if (!/^smena-[a-z0-9-]{10,45}$/.test(orderId)) {
          json(res, 400, { error: "Некорректный номер заказа." });
          return;
        }
        let order = store.getInstallmentOrder(orderId);
        if (!order) {
          json(res, 404, { error: "Заявка не найдена." });
          return;
        }

        const lastCheck = Date.parse(order.last_info_check_at || "");
        const shouldRefresh =
          installmentService.configured &&
          order.status !== "CONFIRMED" &&
          !["CANCELED", "REJECTED", "INIT_FAILED"].includes(order.status) &&
          (!Number.isFinite(lastCheck) || Date.now() - lastCheck >= 10_000);
        if (shouldRefresh) {
          try {
            order = await installmentService.syncOrder(orderId);
          } catch (error) {
            console.error("Installment result status refresh failed", {
              orderId,
              error: error.name,
              httpStatus: error.httpStatus || null,
            });
          }
        }

        json(
          res,
          200,
          publicOrder(order, store.getFiscalReceipt?.(orderId)),
        );
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        json(res, 200, {
          ok: true,
          acquiringConfigured: Boolean(
            config.tbank.terminalKey && config.tbank.password,
          ),
          receiptsConfigured: isAtolConfigured(config),
          installmentsConfigured: isInstallmentsConfigured(config),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/payments/init") {
        if (!allowInit(clientIp(req))) {
          json(res, 429, { error: "Слишком много попыток. Попробуйте позже." });
          return;
        }

        if (!receiptService.configured) {
          json(res, 503, { error: "Приём платежей временно недоступен." });
          return;
        }

        assertTbankConfigured(config);
        const input = validatePaymentInput(parseBody(req, await readBody(req)));
        if (!input.valid) {
          json(res, 400, { error: input.message });
          return;
        }

        const program = findPaymentProgram(input.value.programId);
        if (!program) {
          json(res, 404, { error: "Программа не найдена." });
          return;
        }
        if (program.enrollmentClosed) {
          json(res, 409, { error: "Набор на эту программу закрыт." });
          return;
        }

        const order = {
          orderId: createOrderId(),
          programId: program.id,
          programTitle: program.title,
          amount: program.amount,
          customer: input.value,
          consents: input.value.consents,
        };
        store.create(order);

        try {
          const payment = await initializePayment({
            config,
            order,
            program,
            customer: input.value,
          });
          store.markInitialized(order.orderId, payment);
          json(res, 201, {
            orderId: order.orderId,
            paymentUrl: payment.paymentUrl,
          });
        } catch (error) {
          store.markInitFailed(order.orderId, error.bankCode);
          console.error("Payment initialization failed", {
            orderId: order.orderId,
            error: error.name,
            bankCode: error.bankCode || null,
          });
          json(res, 502, {
            error: "Банк не смог создать платёж. Попробуйте ещё раз позже.",
          });
        }
        return;
      }

      if (
        req.method === "POST" &&
        url.pathname === "/api/payments/notification"
      ) {
        assertTbankConfigured(config);
        const notification = parseBody(req, await readBody(req));

        if (notification.TerminalKey !== config.tbank.terminalKey) {
          text(res, 403, "Invalid terminal");
          return;
        }
        if (!verifyTbankToken(notification, config.tbank.password)) {
          text(res, 403, "Invalid token");
          return;
        }

        const orderId = String(notification.OrderId || "");
        const paymentId = String(notification.PaymentId || "");
        const amount = Number(notification.Amount);
        const status = String(notification.Status || "");
        const succeeded =
          notification.Success === true || notification.Success === "true";

        if (
          !orderId ||
          !paymentId ||
          !Number.isSafeInteger(amount) ||
          amount <= 0 ||
          !status
        ) {
          text(res, 400, "Invalid notification");
          return;
        }
        if (
          ["AUTHORIZED", "CONFIRMED"].includes(status) &&
          (!succeeded || String(notification.ErrorCode || "") !== "0")
        ) {
          text(res, 400, "Inconsistent notification");
          return;
        }

        try {
          const updatedOrder = store.applyNotification({
            orderId,
            paymentId,
            amount,
            status,
          });
          if (status === "CONFIRMED" && updatedOrder.status === "CONFIRMED") {
            receiptService.queueSale(updatedOrder);
          }
        } catch (error) {
          if (error.code === "UNKNOWN_ORDER") {
            text(res, 404, "Unknown order");
            return;
          }
          if (error.code === "PAYMENT_MISMATCH") {
            text(res, 409, "Payment mismatch");
            return;
          }
          if (error.code === "UNKNOWN_STATUS") {
            text(res, 400, "Unknown status");
            return;
          }
          throw error;
        }

        text(res, 200, "OK");
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/payments/status") {
        const orderId = url.searchParams.get("orderId") || "";
        if (!/^smena-[a-z0-9-]{10,45}$/.test(orderId)) {
          json(res, 400, { error: "Некорректный номер заказа." });
          return;
        }
        const order = store.get(orderId);
        if (!order) {
          json(res, 404, { error: "Заказ не найден." });
          return;
        }
        json(
          res,
          200,
          publicOrder(order, store.getFiscalReceipt?.(orderId)),
        );
        return;
      }

      json(res, 404, { error: "Маршрут не найден." });
    } catch (error) {
      if (error.code === "BODY_TOO_LARGE") {
        if (!res.headersSent) json(res, 413, { error: "Запрос слишком большой." });
        return;
      }
      if (error.code === "UNSUPPORTED_CONTENT_TYPE") {
        json(res, 415, { error: "Неподдерживаемый формат запроса." });
        return;
      }
      if (error.code === "TBANK_NOT_CONFIGURED") {
        json(res, 503, { error: "Оплата временно недоступна." });
        return;
      }
      if (error instanceof SyntaxError) {
        json(res, 400, { error: "Некорректный JSON." });
        return;
      }

      console.error("Unhandled API error", { error: error.name });
      if (!res.headersSent) {
        json(res, 500, { error: "Внутренняя ошибка сервера." });
      }
    }
  });

  server.on("close", () => {
    installmentService.stop?.();
    receiptService.stop?.();
    store.close?.();
  });
  return server;
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const config = readConfig();
  const store = createOrderStore(config.orderDbPath);
  const server = createPaymentServer({ config, store });
  server.listen(config.port, config.host, () => {
    console.log(`Payment API listening on ${config.host}:${config.port}`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
