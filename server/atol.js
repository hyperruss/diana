import { assertAtolConfigured } from "./config.js";

const EXPIRED_TOKEN_CODES = new Set([10, 11]);

export class AtolApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AtolApiError";
    this.atolCode = options.atolCode ?? null;
    this.atolType = options.atolType ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable ?? true;
  }
}

function formatMoscowTimestamp(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function rubles(kopecks) {
  if (!Number.isSafeInteger(kopecks) || kopecks <= 0) {
    throw new TypeError("Receipt amount must be a positive integer in kopecks.");
  }
  return Number((kopecks / 100).toFixed(2));
}

function safeItemName(programTitle) {
  return `Предоплата 100% за информационно-консультационные услуги «${programTitle}»`.slice(
    0,
    128,
  );
}

function companyDetails(config) {
  const company = {
    email: config.atol.companyEmail,
    inn: config.atol.inn,
    payment_address: config.publicBaseUrl,
  };
  if (config.atol.sno) company.sno = config.atol.sno;
  return company;
}

export function createAtolInstallmentSellDocument({
  config,
  order,
  now = new Date(),
}) {
  assertAtolConfigured(config);
  const amount = rubles(order.amount);
  const firstPayment = rublesOrZero(order.first_payment_kopecks);
  const financedAmount = Number((amount - firstPayment).toFixed(2));
  const payments = [];
  if (firstPayment > 0) payments.push({ type: 1, sum: firstPayment });
  if (financedAmount > 0) payments.push({ type: 3, sum: financedAmount });

  return {
    external_id: `sell-${order.order_id}`,
    receipt: {
      client: { email: order.customer_email },
      company: companyDetails(config),
      items: [
        {
          name: `Информационно-консультационные услуги «${order.program_title}»`.slice(
            0,
            128,
          ),
          price: amount,
          quantity: 1,
          sum: amount,
          measurement_unit: "услуга",
          payment_method: "full_payment",
          payment_object: "service",
          vat: { type: config.atol.vat },
        },
      ],
      payments,
      total: amount,
      internet: true,
    },
    timestamp: formatMoscowTimestamp(now),
  };
}

function rublesOrZero(kopecks) {
  if (kopecks == null || kopecks === 0) return 0;
  return rubles(kopecks);
}

export function createAtolSellDocument({ config, order, now = new Date() }) {
  if (order.payment_source === "installment") {
    return createAtolInstallmentSellDocument({ config, order, now });
  }
  assertAtolConfigured(config);
  const amount = rubles(order.amount);

  return {
    external_id: `sell-${order.order_id}`,
    receipt: {
      client: {
        email: order.customer_email,
      },
      company: companyDetails(config),
      items: [
        {
          name: safeItemName(order.program_title),
          price: amount,
          quantity: 1,
          sum: amount,
          measurement_unit: "услуга",
          payment_method: "full_prepayment",
          payment_object: "payment",
          vat: {
            type: config.atol.vat,
          },
        },
      ],
      payments: [
        {
          type: 1,
          sum: amount,
        },
      ],
      total: amount,
      internet: true,
    },
    timestamp: formatMoscowTimestamp(now),
  };
}

function parseAtolError(payload, httpStatus) {
  const details = payload?.error;
  const code = Number.isInteger(details?.code) ? details.code : null;
  const message =
    typeof details?.text === "string" && details.text.trim()
      ? details.text.trim()
      : `ATOL Online returned HTTP ${httpStatus}.`;
  return new AtolApiError(message, {
    atolCode: code,
    atolType: typeof details?.type === "string" ? details.type : null,
    httpStatus,
    retryable:
      httpStatus >= 500 ||
      [34, 50, 56].includes(code) ||
      details?.type === "timeout" ||
      details?.type === "unknown",
  });
}

async function requestJson(url, options, timeoutMs, fetchImplementation) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(url, {
      ...options,
      signal: controller.signal,
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new AtolApiError("ATOL Online returned an invalid JSON response.", {
        httpStatus: response.status,
      });
    }
    return { response, payload };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AtolApiError("ATOL Online request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function createAtolClient(config, fetchImplementation = fetch) {
  assertAtolConfigured(config);
  let token = "";

  async function authorize() {
    const { response, payload } = await requestJson(
      `${config.atol.apiBaseUrl}/getToken`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          login: config.atol.login,
          pass: config.atol.password,
        }),
      },
      config.atol.timeoutMs,
      fetchImplementation,
    );

    if (!response.ok || payload?.error || typeof payload?.token !== "string") {
      throw parseAtolError(payload, response.status);
    }
    token = payload.token;
    return token;
  }

  async function authorizedRequest(url, options, mayRefresh = true) {
    const activeToken = token || (await authorize());
    const { response, payload } = await requestJson(
      url,
      {
        ...options,
        headers: {
          ...options.headers,
          Token: activeToken,
        },
      },
      config.atol.timeoutMs,
      fetchImplementation,
    );

    const errorCode = Number.isInteger(payload?.error?.code)
      ? payload.error.code
      : null;
    if (mayRefresh && (response.status === 401 || EXPIRED_TOKEN_CODES.has(errorCode))) {
      token = "";
      return authorizedRequest(url, options, false);
    }
    if (!response.ok || payload?.error || payload?.status === "fail") {
      throw parseAtolError(payload, response.status);
    }
    return payload;
  }

  return {
    async registerSell(order, now = new Date()) {
      const document = createAtolSellDocument({ config, order, now });
      const groupCode = encodeURIComponent(config.atol.groupCode);
      const payload = await authorizedRequest(
        `${config.atol.apiBaseUrl}/${groupCode}/sell`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(document),
        },
      );

      if (typeof payload?.uuid !== "string" || !payload.uuid) {
        throw new AtolApiError("ATOL Online did not return a receipt UUID.");
      }
      return {
        externalId: document.external_id,
        uuid: payload.uuid,
        status: String(payload.status || "wait").toLowerCase(),
      };
    },

    async getReport(uuid) {
      if (typeof uuid !== "string" || !/^[0-9a-z-]{8,128}$/i.test(uuid)) {
        throw new TypeError("Invalid ATOL receipt UUID.");
      }
      const groupCode = encodeURIComponent(config.atol.groupCode);
      let payload;
      try {
        payload = await authorizedRequest(
          `${config.atol.apiBaseUrl}/${groupCode}/report/${encodeURIComponent(uuid)}`,
          { method: "GET", headers: {} },
        );
      } catch (error) {
        if (error instanceof AtolApiError && error.atolCode === 34) {
          return {
            uuid,
            status: "wait",
            errorCode: error.atolCode,
            errorText: error.message,
            receiptUrl: null,
            fiscalDocumentNumber: null,
            fiscalDocumentAttribute: null,
            fnNumber: null,
          };
        }
        throw error;
      }
      return {
        uuid: payload.uuid || uuid,
        status: String(payload.status || "wait").toLowerCase(),
        errorCode: payload.error?.code ?? null,
        errorText: payload.error?.text ?? null,
        receiptUrl: payload.payload?.ofd_receipt_url ?? null,
        fiscalDocumentNumber: payload.payload?.fiscal_document_number ?? null,
        fiscalDocumentAttribute:
          payload.payload?.fiscal_document_attribute ?? null,
        fnNumber: payload.payload?.fn_number ?? null,
      };
    },
  };
}
