import path from "node:path";

const DEFAULT_PUBLIC_URL = "https://smena-academy.ru";

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
  };
}

export function assertTbankConfigured(config) {
  if (!config.tbank.terminalKey || !config.tbank.password) {
    const error = new Error("T-Bank acquiring is not configured.");
    error.code = "TBANK_NOT_CONFIGURED";
    throw error;
  }
}
