import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { createPayClient } from "../client";
import {
  isChargeFailed,
  isChargeSuccess,
  isTransferFailed,
  isTransferSuccess,
} from "../webhooks";
import type { WebhookEvent } from "../types";

const SECRET = "sk_test_secret";
const pay = createPayClient({ provider: "paystack", secretKey: SECRET });

/** Build + verify a Paystack webhook event from a payload. */
function event(payload: unknown): WebhookEvent {
  const raw = JSON.stringify(payload);
  const sig = createHmac("sha512", SECRET).update(raw).digest("hex");
  return pay.webhooks.construct(raw, sig);
}

const chargeOk = () =>
  event({ event: "charge.success", data: { reference: "r1", status: "success", amount: 5000, currency: "NGN" } });
const chargeBad = () =>
  event({ event: "charge.failed", data: { reference: "r2", status: "failed" } });
const transferOk = () =>
  event({ event: "transfer.success", data: { reference: "r3", status: "success" } });
const transferBad = () =>
  event({ event: "transfer.failed", data: { reference: "r4", status: "failed" } });
const other = () =>
  event({ event: "refund.processed", data: { reference: "r5", status: "success" } });

describe("webhook event guards", () => {
  it("isChargeSuccess matches only charge.success", () => {
    expect(isChargeSuccess(chargeOk())).toBe(true);
    expect(isChargeSuccess(chargeBad())).toBe(false);
    expect(isChargeSuccess(transferOk())).toBe(false);
    expect(isChargeSuccess(other())).toBe(false);
  });

  it("isChargeFailed matches only charge.failed", () => {
    expect(isChargeFailed(chargeBad())).toBe(true);
    expect(isChargeFailed(chargeOk())).toBe(false);
  });

  it("isTransferSuccess / isTransferFailed match their payouts", () => {
    expect(isTransferSuccess(transferOk())).toBe(true);
    expect(isTransferSuccess(transferBad())).toBe(false);
    expect(isTransferFailed(transferBad())).toBe(true);
    expect(isTransferFailed(transferOk())).toBe(false);
  });

  it("leaves other Paystack events (open type) unmatched by the known guards", () => {
    const e = other();
    expect(e.type).toBe("refund.processed");
    expect(isChargeSuccess(e)).toBe(false);
    expect(isTransferSuccess(e)).toBe(false);
  });

  it("narrows so status/amount are typed inside the guard", () => {
    const e = chargeOk();
    if (isChargeSuccess(e)) {
      // Compile-time: e.status is "success"; runtime confirms the values.
      const status: "success" = e.status;
      expect(status).toBe("success");
      expect(e.amount).toBe(5000);
      expect(e.reference).toBe("r1");
    } else {
      throw new Error("expected a charge.success event");
    }
  });
});
