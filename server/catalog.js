export const paymentPrograms = Object.freeze({
  bartender: Object.freeze({
    id: "bartender",
    title: "Бармен",
    amount: 4_000_000,
    enrollmentClosed: false,
  }),
  barista: Object.freeze({
    id: "barista",
    title: "Бариста",
    amount: 3_500_000,
    enrollmentClosed: false,
  }),
  waiter: Object.freeze({
    id: "waiter",
    title: "Официант",
    amount: 3_000_000,
    enrollmentClosed: false,
  }),
  hostess: Object.freeze({
    id: "hostess",
    title: "Хостес",
    amount: 2_500_000,
    enrollmentClosed: true,
  }),
  admin: Object.freeze({
    id: "admin",
    title: "Администратор",
    amount: 5_500_000,
    enrollmentClosed: true,
  }),
  manager: Object.freeze({
    id: "manager",
    title: "Менеджер смены",
    amount: 7_500_000,
    enrollmentClosed: true,
  }),
});

export function findPaymentProgram(programId) {
  return paymentPrograms[programId] ?? null;
}
