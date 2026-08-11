const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePaymentInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, message: "Некорректное тело запроса." };
  }

  const programId = typeof input.programId === "string" ? input.programId : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phoneDigits = phone.replace(/\D/g, "");
  const consents = input.consents;

  if (!/^[a-z0-9-]{2,40}$/.test(programId)) {
    return { valid: false, message: "Выберите программу." };
  }
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f]/.test(name)) {
    return { valid: false, message: "Проверьте имя и фамилию." };
  }
  if (phone.length > 40 || phoneDigits.length < 10 || phoneDigits.length > 15) {
    return { valid: false, message: "Проверьте номер телефона." };
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { valid: false, message: "Проверьте электронную почту." };
  }
  if (
    !consents ||
    consents.offer !== true ||
    consents.personalData !== true ||
    consents.privacy !== true
  ) {
    return { valid: false, message: "Подтвердите обязательные согласия." };
  }
  if (
    consents.marketing !== undefined &&
    typeof consents.marketing !== "boolean"
  ) {
    return { valid: false, message: "Некорректное значение согласия." };
  }

  return {
    valid: true,
    value: {
      programId,
      name,
      phone,
      email,
      consents: {
        offer: true,
        personalData: true,
        privacy: true,
        marketing: consents.marketing === true,
      },
    },
  };
}
