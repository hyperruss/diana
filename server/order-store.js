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
    CREATE TABLE IF NOT EXISTS installment_orders (
      order_id TEXT PRIMARY KEY REFERENCES payment_orders(order_id),
      promo_code TEXT NOT NULL,
      requested_term INTEGER NOT NULL,
      application_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'new',
      committed INTEGER NOT NULL DEFAULT 0,
      demo INTEGER NOT NULL DEFAULT 0,
      first_payment_kopecks INTEGER NOT NULL DEFAULT 0,
      actual_term INTEGER,
      loan_number TEXT,
      chosen_bank TEXT,
      info_attempts INTEGER NOT NULL DEFAULT 0,
      info_error TEXT,
      next_info_check_at TEXT,
      last_info_check_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS installment_orders_work_idx
      ON installment_orders(status, committed, next_info_check_at);
    CREATE TABLE IF NOT EXISTS fiscal_receipts (
      external_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES payment_orders(order_id),
      operation TEXT NOT NULL CHECK (operation IN ('sell')),
      status TEXT NOT NULL CHECK (
        status IN ('PENDING', 'RETRY', 'WAIT', 'DONE', 'FAILED')
      ),
      uuid TEXT UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_text TEXT,
      receipt_url TEXT,
      fn_number TEXT,
      fiscal_document_number TEXT,
      fiscal_document_attribute TEXT,
      retry_at TEXT,
      submitted_at TEXT,
      checked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fiscal_receipts_order_id_idx
      ON fiscal_receipts(order_id);
    CREATE INDEX IF NOT EXISTS fiscal_receipts_work_idx
      ON fiscal_receipts(status, retry_at, checked_at);
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
  const insertInstallmentOrder = database.prepare(`
    INSERT INTO installment_orders (
      order_id, promo_code, requested_term, status,
      next_info_check_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'new', ?, ?, ?)
  `);
  const initializeInstallmentOrder = database.prepare(`
    UPDATE installment_orders
    SET application_id = ?, updated_at = ?
    WHERE order_id = ?
  `);
  const selectInstallmentOrder = database.prepare(`
    SELECT
      payment_orders.*,
      installment_orders.promo_code,
      installment_orders.requested_term,
      installment_orders.application_id,
      installment_orders.status AS installment_status,
      installment_orders.committed AS installment_committed,
      installment_orders.demo AS installment_demo,
      installment_orders.first_payment_kopecks,
      installment_orders.actual_term,
      installment_orders.loan_number,
      installment_orders.chosen_bank,
      installment_orders.info_attempts,
      installment_orders.info_error,
      installment_orders.next_info_check_at,
      installment_orders.last_info_check_at
    FROM payment_orders
    JOIN installment_orders
      ON installment_orders.order_id = payment_orders.order_id
    WHERE payment_orders.order_id = ?
  `);
  const updateInstallmentInfo = database.prepare(`
    UPDATE installment_orders
    SET status = ?, committed = ?, first_payment_kopecks = ?,
        actual_term = ?, loan_number = ?, chosen_bank = ?,
        info_attempts = info_attempts + 1, info_error = NULL,
        next_info_check_at = ?, last_info_check_at = ?, updated_at = ?
    WHERE order_id = ?
  `);
  const updateInstallmentPaymentStatus = database.prepare(`
    UPDATE payment_orders
    SET status = ?, updated_at = ?
    WHERE order_id = ?
  `);
  const updateInstallmentSyncProblem = database.prepare(`
    UPDATE installment_orders
    SET info_attempts = info_attempts + 1, info_error = ?,
        next_info_check_at = ?, last_info_check_at = ?, updated_at = ?
    WHERE order_id = ?
  `);
  const selectNextInstallmentToCheck = database.prepare(`
    SELECT payment_orders.*
    FROM payment_orders
    JOIN installment_orders
      ON installment_orders.order_id = payment_orders.order_id
    WHERE installment_orders.next_info_check_at IS NOT NULL
      AND installment_orders.next_info_check_at <= ?
      AND NOT (
        installment_orders.status = 'signed'
        AND installment_orders.committed = 1
      )
      AND installment_orders.status NOT IN ('canceled', 'rejected')
    ORDER BY installment_orders.next_info_check_at
    LIMIT 1
  `);
  const notificationUpdate = database.prepare(`
    UPDATE payment_orders
    SET payment_id = COALESCE(payment_id, ?), status = ?, updated_at = ?
    WHERE order_id = ?
  `);
  const insertFiscalReceipt = database.prepare(`
    INSERT OR IGNORE INTO fiscal_receipts (
      external_id, order_id, operation, status, created_at, updated_at
    ) VALUES (?, ?, 'sell', 'PENDING', ?, ?)
  `);
  const selectFiscalReceipt = database.prepare(`
    SELECT * FROM fiscal_receipts
    WHERE order_id = ? AND operation = ?
  `);
  const selectPendingFiscalReceipt = database.prepare(`
    SELECT * FROM fiscal_receipts
    WHERE status = 'PENDING'
       OR (status = 'RETRY' AND (retry_at IS NULL OR retry_at <= ?))
    ORDER BY created_at
    LIMIT 1
  `);
  const selectWaitingFiscalReceipt = database.prepare(`
    SELECT * FROM fiscal_receipts
    WHERE status = 'WAIT'
      AND submitted_at <= ?
      AND (checked_at IS NULL OR checked_at <= ?)
    ORDER BY COALESCE(checked_at, submitted_at)
    LIMIT 1
  `);
  const selectReceiptOrder = database.prepare(`
    SELECT
      payment_orders.*,
      CASE WHEN installment_orders.order_id IS NULL
        THEN 'card' ELSE 'installment' END AS payment_source,
      COALESCE(installment_orders.first_payment_kopecks, 0)
        AS first_payment_kopecks
    FROM payment_orders
    JOIN fiscal_receipts
      ON fiscal_receipts.order_id = payment_orders.order_id
    LEFT JOIN installment_orders
      ON installment_orders.order_id = payment_orders.order_id
    WHERE fiscal_receipts.external_id = ?
  `);
  const markFiscalSubmitted = database.prepare(`
    UPDATE fiscal_receipts
    SET uuid = ?, status = ?, attempts = attempts + 1,
        error_code = NULL, error_text = NULL, retry_at = NULL,
        submitted_at = COALESCE(submitted_at, ?), updated_at = ?
    WHERE external_id = ?
  `);
  const markFiscalRetry = database.prepare(`
    UPDATE fiscal_receipts
    SET status = ?, attempts = attempts + 1, error_code = ?, error_text = ?,
        retry_at = ?, updated_at = ?
    WHERE external_id = ?
  `);
  const markFiscalResult = database.prepare(`
    UPDATE fiscal_receipts
    SET status = ?, error_code = ?, error_text = ?, receipt_url = ?,
        fn_number = ?, fiscal_document_number = ?,
        fiscal_document_attribute = ?, checked_at = ?, updated_at = ?
    WHERE external_id = ?
  `);
  const markFiscalChecked = database.prepare(`
    UPDATE fiscal_receipts
    SET checked_at = ?, updated_at = ?
    WHERE external_id = ?
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

    createInstallment(order, { promoCode, term }) {
      const now = new Date();
      const firstCheck = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        insertOrder.run(
          order.orderId,
          order.programId,
          order.programTitle,
          order.amount,
          order.customer.name,
          order.customer.phone,
          order.customer.email,
          JSON.stringify(order.consents),
          now.toISOString(),
          now.toISOString(),
        );
        insertInstallmentOrder.run(
          order.orderId,
          promoCode,
          term,
          firstCheck,
          now.toISOString(),
          now.toISOString(),
        );
        database.exec("COMMIT");
        return this.getInstallmentOrder(order.orderId);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    getInstallmentOrder(orderId) {
      return selectInstallmentOrder.get(orderId) ?? null;
    },

    markInstallmentInitialized(orderId, application) {
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        initializeOrder.run(
          application.applicationId,
          application.applicationUrl,
          "INSTALLMENT_NEW",
          now,
          orderId,
        );
        initializeInstallmentOrder.run(
          application.applicationId,
          now,
          orderId,
        );
        database.exec("COMMIT");
        return this.getInstallmentOrder(orderId);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    markInstallmentInitFailed(orderId, errorCode = "UNKNOWN") {
      failOrder.run(
        String(errorCode).slice(0, 64),
        new Date().toISOString(),
        orderId,
      );
      return this.getInstallmentOrder(orderId);
    },

    applyInstallmentInfo(orderId, info) {
      const current = this.getInstallmentOrder(orderId);
      if (!current) {
        const error = new Error("Unknown installment order.");
        error.code = "UNKNOWN_INSTALLMENT_ORDER";
        throw error;
      }
      const now = new Date();
      const terminal =
        info.finalized || ["canceled", "rejected"].includes(info.status);
      const nextCheck = terminal
        ? null
        : new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      const paymentStatus = info.finalized
        ? "CONFIRMED"
        : info.status === "canceled"
          ? "CANCELED"
          : info.status === "rejected"
            ? "REJECTED"
            : `INSTALLMENT_${info.status.toUpperCase()}`;

      database.exec("BEGIN IMMEDIATE");
      try {
        updateInstallmentInfo.run(
          info.status,
          info.committed ? 1 : 0,
          info.firstPaymentKopecks,
          info.term,
          info.loanNumber,
          info.chosenBank,
          nextCheck,
          now.toISOString(),
          now.toISOString(),
          orderId,
        );
        updateInstallmentPaymentStatus.run(
          paymentStatus,
          now.toISOString(),
          orderId,
        );
        database.exec("COMMIT");
        return this.getInstallmentOrder(orderId);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    markInstallmentSyncProblem(orderId, error) {
      const current = this.getInstallmentOrder(orderId);
      if (!current) return null;
      const now = new Date();
      const attempts = Number(current.info_attempts || 0) + 1;
      const delayMs = Math.min(5 * 60 * 1000 * 2 ** Math.min(attempts - 1, 5), 60 * 60 * 1000);
      const nextCheck = error.retryable
        ? new Date(now.getTime() + delayMs).toISOString()
        : null;
      updateInstallmentSyncProblem.run(
        String(error.message || "Installment synchronization error").slice(0, 1000),
        nextCheck,
        now.toISOString(),
        now.toISOString(),
        orderId,
      );
      return this.getInstallmentOrder(orderId);
    },

    nextInstallmentToCheck(now = new Date()) {
      return selectNextInstallmentToCheck.get(now.toISOString()) ?? null;
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
        const updatedOrder = this.get(orderId);
        if (updatedOrder.status === "CONFIRMED") {
          const now = new Date().toISOString();
          insertFiscalReceipt.run(`sell-${orderId}`, orderId, now, now);
        }
        database.exec("COMMIT");
        return updatedOrder;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    queueSellReceipt(orderId) {
      const now = new Date().toISOString();
      insertFiscalReceipt.run(`sell-${orderId}`, orderId, now, now);
      return this.getFiscalReceipt(orderId);
    },

    getFiscalReceipt(orderId, operation = "sell") {
      return selectFiscalReceipt.get(orderId, operation) ?? null;
    },

    getReceiptOrder(externalId) {
      return selectReceiptOrder.get(externalId) ?? null;
    },

    nextReceiptToSubmit(now = new Date()) {
      return selectPendingFiscalReceipt.get(now.toISOString()) ?? null;
    },

    nextReceiptToCheck(now = new Date()) {
      const reportDelay = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const checkDelay = new Date(now.getTime() - 60 * 1000).toISOString();
      return selectWaitingFiscalReceipt.get(reportDelay, checkDelay) ?? null;
    },

    markReceiptSubmitted(externalId, receipt) {
      const now = new Date().toISOString();
      const status = receipt.status === "done" ? "DONE" : "WAIT";
      markFiscalSubmitted.run(receipt.uuid, status, now, now, externalId);
    },

    markReceiptProblem(externalId, error, retryable) {
      const now = new Date();
      const current = database
        .prepare("SELECT attempts FROM fiscal_receipts WHERE external_id = ?")
        .get(externalId);
      const attempts = Number(current?.attempts || 0) + 1;
      const delayMs = Math.min(5 * 60 * 1000 * 2 ** Math.min(attempts - 1, 6), 6 * 60 * 60 * 1000);
      const retryAt = retryable
        ? new Date(now.getTime() + delayMs).toISOString()
        : null;
      markFiscalRetry.run(
        retryable ? "RETRY" : "FAILED",
        error.atolCode == null ? null : String(error.atolCode).slice(0, 32),
        String(error.message || "ATOL error").slice(0, 1000),
        retryAt,
        now.toISOString(),
        externalId,
      );
    },

    markReceiptResult(externalId, report) {
      const now = new Date().toISOString();
      if (report.status === "wait") {
        markFiscalChecked.run(now, now, externalId);
        return;
      }
      markFiscalResult.run(
        report.status === "done" ? "DONE" : "FAILED",
        report.errorCode == null ? null : String(report.errorCode).slice(0, 32),
        report.errorText ? String(report.errorText).slice(0, 1000) : null,
        report.receiptUrl ? String(report.receiptUrl).slice(0, 2048) : null,
        report.fnNumber == null ? null : String(report.fnNumber),
        report.fiscalDocumentNumber == null
          ? null
          : String(report.fiscalDocumentNumber),
        report.fiscalDocumentAttribute == null
          ? null
          : String(report.fiscalDocumentAttribute),
        now,
        now,
        externalId,
      );
    },

    close() {
      database.close();
    },
  };
}
