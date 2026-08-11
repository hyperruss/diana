import assert from "node:assert/strict";
import test from "node:test";
import { findPaymentProgram } from "./catalog.js";

test("server catalog owns prices and enrollment state", () => {
  assert.equal(findPaymentProgram("bartender").amount, 4_000_000);
  assert.equal(findPaymentProgram("barista").amount, 3_500_000);
  assert.equal(findPaymentProgram("waiter").amount, 3_000_000);
  assert.equal(findPaymentProgram("hostess").enrollmentClosed, true);
  assert.equal(findPaymentProgram("admin").enrollmentClosed, true);
  assert.equal(findPaymentProgram("manager").enrollmentClosed, true);
});
