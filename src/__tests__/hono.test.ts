import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { createPayClient } from "../client";
import { constructWebhookFromRequest, webhookHandler } from "../adapters/hono";

const SECRET = "sk_test_secret";
const pay = createPayClient({ provider: "paystack", secretKey: SECRET });

/** A real Paystack-signed webhook over the given payload. */
function signedRequest(payload: unknown, signature?: string): Request {
  const raw = JSON.stringify(payload);
  const sig = signature ?? createHmac("sha512", SECRET).update(raw).digest("hex");
  return new Request("https://app.test/api/webhooks/pay", {
    method: "POST",
    headers: { "x-paystack-signature": sig, "content-type": "application/json" },
    body: raw,
  });
}

/** A Hono-shaped context wrapping a Web Request. */
function honoContext(request: Request) {
  return { req: { raw: request } };
}

const CHARGE_SUCCESS = {
  event: "charge.success",
  data: { reference: "ref_123", status: "success", amount: 500000, currency: "NGN" },
};

describe("hono adapter: constructWebhookFromRequest", () => {
  it("verifies a real signed request and normalizes the event", async () => {
    const event = await constructWebhookFromRequest(pay, signedRequest(CHARGE_SUCCESS));
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("ref_123");
  });

  it("throws invalid_signature on a tampered body", async () => {
    await expect(constructWebhookFromRequest(pay, signedRequest(CHARGE_SUCCESS, "bad"))).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });
});

describe("hono adapter: webhookHandler", () => {
  it("returns 200 and dispatches the event on a valid webhook", async () => {
    let seen: string | undefined;
    const handle = webhookHandler(pay, { onEvent: (e) => void (seen = e.reference) });

    const res = await handle(honoContext(signedRequest(CHARGE_SUCCESS)));
    expect(res.status).toBe(200);
    expect(seen).toBe("ref_123");
    expect(await res.json()).toEqual({ received: true });
  });

  it("returns 401 on a bad signature and never calls onEvent", async () => {
    let called = false;
    const handle = webhookHandler(pay, { onEvent: () => void (called = true) });

    const res = await handle(honoContext(signedRequest(CHARGE_SUCCESS, "not-the-signature")));
    expect(res.status).toBe(401);
    expect(called).toBe(false);
  });

  it("returns 500 when the handler throws (so the provider retries)", async () => {
    const handle = webhookHandler(pay, {
      onEvent: () => {
        throw new Error("db down");
      },
    });

    const res = await handle(honoContext(signedRequest(CHARGE_SUCCESS)));
    expect(res.status).toBe(500);
  });

  it("reports failures to onError", async () => {
    const errors: unknown[] = [];
    const handle = webhookHandler(pay, { onEvent: () => {}, onError: (err) => errors.push(err) });

    await handle(honoContext(signedRequest(CHARGE_SUCCESS, "bad")));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "invalid_signature" });
  });
});
