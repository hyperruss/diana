import path from "node:path";

const DEFAULT_PUBLIC_URL = "https://smena-academy.ru";
const DEFAULT_INSTALLMENT_SHOP_ID = "35bb5137-06c0-4c9e-91bc-a28a1b40b08d";
const DEFAULT_INSTALLMENT_SHOWCASE_ID = "bc224ee9-9d68-4ec7-8cf3-2a314f7d2b1e";
const DEFAULT_INSTALLMENT_PROMO_CODE_6 = "installment_0_0_6_8,6";
const DEFAULT_INSTALLMENT_PROMO_CODE_12 = "installment_0_0_12_15,2";

const ATOL_VAT_TYPES = new Set([
  "none",
  "vat0",
  "vat5",
  "vat7",
  "vat10",
  "vat20",
  "vat22",
  "vat105",
  "vat107",
  "vat110",
  "vat120",
  "vat122",
]);

const ATOL_SNO_TYPES = new Set([
  "",
  "osn",
  "usn_income",
  "usn_income_outcome",
  "envd",
  "esn",
  "patent",
]);

function normalizedUrl(value, fallback) {
  const url = new URL(value || fallback);
  return url.toString().replace(/\/$/, "");
}

export function readConfig(environment = process.env) {
  const publicBaseUrl = normalizedUrl(
    environment.PUBLIC_BASE_URL,
    DEFAULT_PUBLIC_URL,
  );

  if (
    environment.NODE_ENV === "production" &&
    !publicBaseUrl.startsWith("https://")
  ) {
    throw new Error("PUBLIC_BASE_URL must use HTTPS in production.");
  }

  const atolVat = environment.ATOL_VAT?.trim() || "";
  const atolSno = environment.ATOL_SNO?.trim() || "";
  if (atolVat && !ATOL_VAT_TYPES.has(atolVat)) {
    throw new Error("ATOL_VAT contains an unsupported API v4 value.");
  }
  if (!ATOL_SNO_TYPES.has(atolSno)) {
    throw new Error("ATOL_SNO contains an unsupported API v4 value.");
  }

  const installmentPromoOptions = [
    {
      text: "На 6 месяцев",
      term: 6,
      value: environment.TBANK_INSTALLMENT_PROMO_CODE_6?.trim() || DEFAULT_INSTALLMENT_PROMO_CODE_6,
    },
    {
      text: "На 12 месяцев",
      term: 12,
      value: environment.TBANK_INSTALLMENT_PROMO_CODE_12?.trim() || DEFAULT_INSTALLMENT_PROMO_CODE_12,
    },
  ].filter((option) => option.value);
  const legacyInstallmentPromoCode =
    environment.TBANK_INSTALLMENT_PROMO_CODE?.trim() || "";

  if (!installmentPromoOptions.length && legacyInstallmentPromoCode) {
    installmentPromoOptions.push({
      text: "Рассрочка",
      term: Number.parseInt(
        legacyInstallmentPromoCode.match(/installment_[^_]*_[^_]*_(\d+)_/)?.[1] ||
          "0",
        10,
      ),
      value: legacyInstallmentPromoCode,
    });
  }

  return {
    host: environment.HOST || "127.0.0.1",
    port: Number.parseInt(environment.PORT || "3000", 10),
    publicBaseUrl,
    orderDbPath:
      environment.ORDER_DB_PATH ||
      path.resolve(process.cwd(), "server", "data", "orders.sqlite"),
    tbank: {
      terminalKey: environment.TBANK_TERMINAL_KEY?.trim() || "",
      password: environment.TBANK_PASSWORD || "",
      apiBaseUrl: normalizedUrl(
        environment.TBANK_API_BASE_URL,
        "https://securepay.tinkoff.ru/v2",
      ),
      timeoutMs: Number.parseInt(environment.TBANK_TIMEOUT_MS || "10000", 10),
    },
    installments: {
      shopId: environment.TBANK_INSTALLMENT_SHOP_ID?.trim() || DEFAULT_INSTALLMENT_SHOP_ID,
      showcaseId:
        environment.TBANK_INSTALLMENT_SHOWCASE_ID?.trim() || DEFAULT_INSTALLMENT_SHOWCASE_ID,
      apiPassword: environment.TBANK_INSTALLMENT_API_PASSWORD || "",
      promoOptions: installmentPromoOptions,
      apiBaseUrl: normalizedUrl(
        environment.TBANK_INSTALLMENT_API_BASE_URL,
        "https://forma.tbank.ru/api/partners/v2",
      ),
      timeoutMs: Number.parseInt(
        environment.TBANK_INSTALLMENT_TIMEOUT_MS || "10000",
        10,
      ),
      workerIntervalMs: Number.parseInt(
        environment.TBANK_INSTALLMENT_WORKER_INTERVAL_MS || "300000",
        10,
      ),
    },
    atol: {
      login: environment.ATOL_LOGIN?.trim() || "",
      password: environment.ATOL_PASSWORD || "",
      groupCode: environment.ATOL_GROUP_CODE?.trim() || "",
      inn: environment.ATOL_INN?.trim() || "",
      companyEmail: environment.ATOL_COMPANY_EMAIL?.trim().toLowerCase() || "",
      vat: atolVat,
      sno: atolSno,
      apiBaseUrl: normalizedUrl(
        environment.ATOL_API_BASE_URL,
        "https://online.atol.ru/possystem/v4",
      ),
      timeoutMs: Number.parseInt(environment.ATOL_TIMEOUT_MS || "10000", 10),
      workerIntervalMs: Number.parseInt(
        environment.ATOL_WORKER_INTERVAL_MS || "60000",
        10,
      ),
    },
  };
}

export function assertTbankConfigured(config) {
  if (!config.tbank.terminalKey || !config.tbank.password) {
    const error = new Error("T-Bank acquiring is not configured.");
    error.code = "TBANK_NOT_CONFIGURED";
    throw error;
  }
}

export function isInstallmentsConfigured(config) {
  const installments = config.installments || {};
  return Boolean(
    installments.shopId &&
      installments.shopId.length <= 50 &&
      installments.showcaseId &&
      installments.showcaseId.length <= 50 &&
      installments.apiPassword &&
      installments.apiPassword.length <= 256 &&
      installments.promoOptions?.length &&
      installments.promoOptions.every(
        (option) =>
          option.text &&
          option.text.length <= 64 &&
          Number.isInteger(option.term) &&
          option.term > 0 &&
          option.value &&
          option.value.length <= 64,
      ),
  );
}

export function isAtolConfigured(config) {
  const atol = config.atol || {};
  return Boolean(
    atol.login &&
      atol.password &&
      atol.groupCode &&
      /^(?:\d{10}|\d{12})$/.test(atol.inn || "") &&
      atol.companyEmail &&
      atol.vat,
  );
}

export function assertAtolConfigured(config) {
  if (!isAtolConfigured(config)) {
    const error = new Error("ATOL Online is not configured.");
    error.code = "ATOL_NOT_CONFIGURED";
    throw error;
  }
}
