import assert from "node:assert/strict";
import test from "node:test";
import { createTbankToken, verifyTbankToken } from "./tbank.js";

test("creates the token from the official T-Bank example", () => {
  const token = createTbankToken(
    {
      TerminalKey: "MerchantTerminalKey",
      Amount: 19200,
      OrderId: "00000",
      Description: "Подарочная карта на 1000 рублей",
      DATA: { Phone: "+71234567890" },
      Receipt: { Items: [] },
    },
    "11111111111111",
  );

  assert.equal(
    token,
    "72dd466f8ace0a37a1f740ce5fb78101712bc0665d91a8108c7c8a0ccd426db2",
  );
});

test("verifies notifications and ignores nested objects", () => {
  const notification = {
    TerminalKey: "1234567890DEMO",
    OrderId: "000000",
    Success: true,
    Status: "AUTHORIZED",
    PaymentId: "0000000",
    ErrorCode: "0",
    Amount: "1111",
    CardId: "000000",
    Pan: "200000******0000",
    ExpDate: "1111",
    RebillId: "000000",
    Data: { ignored: "value" },
    Token: "1c0964277d0213349243065a0d5b838b8e90d2d25f740d0f2767836e710e80c8",
  };

  assert.equal(verifyTbankToken(notification, "11111111111"), true);
  assert.equal(verifyTbankToken({ ...notification, Amount: "1112" }, "11111111111"), false);
});
