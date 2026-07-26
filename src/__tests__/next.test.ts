import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { createPayClient } from "../client";
import { constructWebhookFromRequest, webhookRoute } from "../adapters/next";

const SECRET = "sk_test_secret";
const pay = createPayClient({ provider: "paystack", secretKey: SECRET });

/** A real Paystack-signed webhook Request over the given payload. */
function signedRequest(payload: unknown, signature?: string): Request {
  const raw = JSON.stringify(payload);
  const sig = signature ?? createHmac("sha512", SECRET).update(raw).digest("hex");
  return new Request("https://app.test/api/webhooks/pay", {
    method: "POST",
    headers: { "x-paystack-signature": sig, "content-type": "application/json" },
    body: raw,
  });
}

const CHARGE_SUCCESS = {
  event: "charge.success",
  data: { reference: "ref_123", status: "success", amount: 500000, currency: "NGN" },
};

describe("next adapter: constructWebhookFromRequest", () => {
  it("verifies a real signed request and normalizes the event", async () => {
    const event = await constructWebhookFromRequest(pay, signedRequest(CHARGE_SUCCESS));
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("ref_123");
    expect(event.amount).toBe(500000);
  });

  it("throws invalid_signature on a tampered body", async () => {
    const bad = signedRequest(CHARGE_SUCCESS, "deadbeef");
    await expect(constructWebhookFromRequest(pay, bad)).rejects.toMatchObject({
      name: "PayKitError",
      code: "invalid_signature",
    });
  });
});

describe("next adapter: webhookRoute", () => {
  it("returns 200 and dispatches the event on a valid webhook", async () => {
    let seen: string | undefined;
    const POST = webhookRoute(pay, { onEvent: (e) => void (seen = e.reference) });

    const res = await POST(signedRequest(CHARGE_SUCCESS));
    expect(res.status).toBe(200);
    expect(seen).toBe("ref_123");
    expect(await res.json()).toEqual({ received: true });
  });

  it("returns 401 on a bad signature and never calls onEvent", async () => {
    let called = false;
    const POST = webhookRoute(pay, { onEvent: () => void (called = true) });

    const res = await POST(signedRequest(CHARGE_SUCCESS, "not-the-signature"));
    expect(res.status).toBe(401);
    expect(called).toBe(false);
  });

  it("returns 500 when the handler throws (so the provider retries)", async () => {
    const POST = webhookRoute(pay, {
      onEvent: () => {
        throw new Error("db down");
      },
    });

    const res = await POST(signedRequest(CHARGE_SUCCESS));
    expect(res.status).toBe(500);
  });

  it("reports failures to onError", async () => {
    const errors: unknown[] = [];
    const POST = webhookRoute(pay, {
      onEvent: () => {},
      onError: (err) => errors.push(err),
    });

    await POST(signedRequest(CHARGE_SUCCESS, "bad"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "invalid_signature" });
  });
});
