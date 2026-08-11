import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const STATUS_ORDER = new Map([
  ["CREATED", 0],
  ["NEW", 10],
  ["FORM_SHOWED", 20],
  ["AUTHORIZING", 30],
  ["3DS_CHECKING", 40],
  ["3DS_CHECKED", 45],
  ["AUTHORIZED", 50],
  ["CONFIRMING", 60],
  ["CONFIRMED", 70],
  ["REJECTED", 80],
  ["DEADLINE_EXPIRED", 80],
  ["ATTEMPTS_EXPIRED", 80],
  ["CANCELING", 85],
  ["REVERSING", 85],
  ["REFUNDING", 85],
  ["PARTIAL_REFUNDED", 90],
  ["CANCELED", 100],
  ["REVERSED", 100],
  ["REFUNDED", 100],
]);

const irreversibleStatuses = new Set([
  "CANCELED",
  "REVERSED",
  "REFUNDED",
  "REJECTED",
  "DEADLINE_EXPIRED",
  "ATTEMPTS_EXPIRED",
]);

export function shouldApplyStatus(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  if (!STATUS_ORDER.has(nextStatus)) return false;
  if (!STATUS_ORDER.has(currentStatus)) return true;
  if (irreversibleStatuses.has(currentStatus)) return false;

  if (currentStatus === "PARTIAL_REFUNDED") {
    return nextStatus === "REFUNDED";
  }

  return STATUS_ORDER.get(nextStatus) >= STATUS_ORDER.get(currentStatus);
}

export function createOrderStore(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS payment_orders (
      order_id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      program_title TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'RUB',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      consents_json TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_id TEXT UNIQUE,
      payment_url TEXT,
      bank_error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payment_orders_created_at_idx
      ON payment_orders(created_at);
  `);

  const insertOrder = database.prepare(`
    INSERT INTO payment_orders (
      order_id, program_id, program_title, amount, customer_name,
      customer_phone, customer_email, consents_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?)
  `);
  const selectOrder = database.prepare(
    "SELECT * FROM payment_orders WHERE order_id = ?",
  );
  const initializeOrder = database.prepare(`
    UPDATE payment_orders
    SET payment_id = ?, payment_url = ?,
        status = CASE WHEN status = 'CREATED' THEN ? ELSE status END,
        updated_at = ?
    WHERE order_id = ?
  `);
  const failOrder = database.prepare(`
    UPDATE payment_orders
    SET status = CASE WHEN status = 'CREATED' THEN 'INIT_FAILED' ELSE status END,
        bank_error_code = ?, updated_at = ?
    WHERE order_id = ?
  `);
  const notificationUpdate = database.prepare(`
    UPDATE payment_orders
    SET payment_id = COALESCE(payment_id, ?), status = ?, updated_at = ?
    WHERE order_id = ?
  `);

  return {
    create(order) {
      const now = new Date().toISOString();
      insertOrder.run(
        order.orderId,
        order.programId,
        order.programTitle,
        order.amount,
        order.customer.name,
        order.customer.phone,
        order.customer.email,
        JSON.stringify(order.consents),
        now,
        now,
      );
      return this.get(order.orderId);
    },

    get(orderId) {
      return selectOrder.get(orderId) ?? null;
    },

    markInitialized(orderId, payment) {
      initializeOrder.run(
        payment.paymentId,
        payment.paymentUrl,
        payment.status,
        new Date().toISOString(),
        orderId,
      );
      return this.get(orderId);
    },

    markInitFailed(orderId, bankErrorCode = "UNKNOWN") {
      failOrder.run(
        String(bankErrorCode).slice(0, 64),
        new Date().toISOString(),
        orderId,
      );
      return this.get(orderId);
    },

    applyNotification({ orderId, paymentId, amount, status }) {
      if (!STATUS_ORDER.has(status)) {
        const error = new Error("Unknown payment status.");
        error.code = "UNKNOWN_STATUS";
        throw error;
      }
      database.exec("BEGIN IMMEDIATE");
      try {
        const order = this.get(orderId);
        if (!order) {
          const error = new Error("Unknown order.");
          error.code = "UNKNOWN_ORDER";
          throw error;
        }
        if (order.amount !== amount) {
          const error = new Error("Payment amount mismatch.");
          error.code = "PAYMENT_MISMATCH";
          throw error;
        }
        if (order.payment_id && order.payment_id !== paymentId) {
          const error = new Error("Payment identifier mismatch.");
          error.code = "PAYMENT_MISMATCH";
          throw error;
        }

        if (shouldApplyStatus(order.status, status)) {
          notificationUpdate.run(
            paymentId,
            status,
            new Date().toISOString(),
            orderId,
          );
        }
        database.exec("COMMIT");
        return this.get(orderId);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    close() {
      database.close();
    },
  };
}
