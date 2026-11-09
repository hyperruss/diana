const INSTALLMENT_STATUSES = new Set([
  "new",
  "inprogress",
  "approved",
  "signed",
  "canceled",
  "rejected",
]);

export class InstallmentApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "InstallmentApiError";
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable ?? true;
  }
}

async function requestJson(url, options, timeoutMs, fetchImplementation) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(url, {
      ...options,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) {
      const message =
        payload?.message ||
        payload?.error?.message ||
        payload?.error ||
        `T-Bank Installments returned HTTP ${response.status}.`;
      throw new InstallmentApiError(String(message), {
        httpStatus: response.status,
        retryable: response.status >= 500 || response.status === 429,
      });
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new InstallmentApiError("T-Bank Installments request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function splitName(name) {
  const [firstName = "", lastName = "", ...middleNameParts] = String(name)
    .trim()
    .split(/\s+/);
  return {
    firstName,
    lastName,
    middleName: middleNameParts.join(" "),
  };
}

function basicAuthorization(showcaseId, apiPassword) {
  return `Basic ${Buffer.from(`${showcaseId}:${apiPassword}`, "utf8").toString("base64")}`;
}

export function createInstallmentClient(config, fetchImplementation = fetch) {
  const settings = config.installments;

  return {
    async createApplication({ order, program, customer, promoCode }) {
      const fio = splitName(customer.name);
      const payload = await requestJson(
        `${settings.apiBaseUrl}/orders/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            shopId: settings.shopId,
            showcaseId: settings.showcaseId,
            sum: order.amount / 100,
            items: [
              {
                name: `Обучение по программе «${program.title}»`,
                quantity: 1,
                price: order.amount / 100,
                category: "education",
                vendorCode: program.id,
              },
            ],
            orderNumber: order.orderId,
            promoCode,
            webhookURL: `${config.publicBaseUrl}/api/installments/notification`,
            successURL: `${config.publicBaseUrl}/payment/installment-result?orderId=${encodeURIComponent(order.orderId)}`,
            failURL: `${config.publicBaseUrl}/payment/installment-result?orderId=${encodeURIComponent(order.orderId)}`,
            returnURL: `${config.publicBaseUrl}/payment/${encodeURIComponent(program.id)}`,
            values: {
              contact: {
                fio,
                mobilePhone: customer.phone,
                email: customer.email,
              },
            },
          }),
        },
        settings.timeoutMs,
        fetchImplementation,
      );

      if (typeof payload.id !== "string" || typeof payload.link !== "string") {
        throw new InstallmentApiError(
          "T-Bank Installments returned an invalid Create response.",
          { retryable: false },
        );
      }
      const applicationUrl = new URL(payload.link);
      if (applicationUrl.protocol !== "https:") {
        throw new InstallmentApiError(
          "T-Bank Installments returned a non-HTTPS application URL.",
          { retryable: false },
        );
      }
      return { applicationId: payload.id, applicationUrl: applicationUrl.toString() };
    },

    async getInfo(orderNumber) {
      return requestJson(
        `${settings.apiBaseUrl}/orders/${encodeURIComponent(orderNumber)}/info`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: basicAuthorization(
              settings.showcaseId,
              settings.apiPassword,
            ),
          },
        },
        settings.timeoutMs,
        fetchImplementation,
      );
    },
  };
}

export function validateInstallmentInfo(info, order) {
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new InstallmentApiError("Invalid Installments Info response.", {
      retryable: false,
    });
  }
  if (info.id !== order.order_id || !INSTALLMENT_STATUSES.has(info.status)) {
    throw new InstallmentApiError("Installments Info order mismatch.", {
      retryable: false,
    });
  }
  if (info.demo !== false || typeof info.committed !== "boolean") {
    throw new InstallmentApiError("Demo or invalid installment application.", {
      retryable: false,
    });
  }
  if (info.product && info.product !== "installment_credit") {
    throw new InstallmentApiError("Unexpected installment product.", {
      retryable: false,
    });
  }

  const orderAmountKopecks = Math.round(Number(info.order_amount) * 100);
  const firstPaymentKopecks = Math.round(Number(info.first_payment || 0) * 100);
  if (
    !Number.isSafeInteger(orderAmountKopecks) ||
    orderAmountKopecks !== order.amount ||
    !Number.isSafeInteger(firstPaymentKopecks) ||
    firstPaymentKopecks < 0 ||
    firstPaymentKopecks > order.amount
  ) {
    throw new InstallmentApiError("Installments Info amount mismatch.", {
      retryable: false,
    });
  }

  return {
    status: info.status,
    committed: info.committed,
    firstPaymentKopecks,
    term: Number.isInteger(info.term) ? info.term : null,
    loanNumber: typeof info.loan_number === "string" ? info.loan_number : null,
    chosenBank: typeof info.chosen_bank === "string" ? info.chosen_bank : null,
    finalized: info.status === "signed" && info.committed === true,
  };
}

export function isTbankInstallmentWebhookIp(value) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
    String(value || "").trim(),
  );
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  return (
    octets[0] === 91 &&
    octets[1] === 194 &&
    (octets[2] === 226 || octets[2] === 227) &&
    octets[3] >= 1 &&
    octets[3] <= 254
  );
}
