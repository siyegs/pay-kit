/**
 * Real-framework tests: mount the Hono adapter on an actual Hono app and
 * verify the full status-code matrix (200/401/400/500) through a real
 * dispatch.
 */
import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { createPayClient } from "../client";
import { webhookHandler } from "../adapters/hono";

const SECRET = "sk_test_framework";
const PAYLOAD = {
  event: "charge.success",
  data: { reference: "fw_hno_1", status: "success", amount: 500000, currency: "NGN" },
};
const RAW = JSON.stringify(PAYLOAD);

function sign(raw: string, key: string): string {
  return createHmac("sha512", key).update(raw).digest("hex");
}

function signedRequest(sig?: string, body: string = RAW): Request {
  return new Request("http://localhost/webhooks/pay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": sig ?? sign(RAW, SECRET),
    },
    body,
  });
}

describe("hono adapter: real app", () => {
  it("returns 200 and dispatches the event on a valid webhook", async () => {
    const seen: string[] = [];
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
    const app = new Hono();
    app.post("/webhooks/pay", webhookHandler(pay, { onEvent: (e) => void seen.push(e.reference) }));

    const res = await app.request(signedRequest());
    expect(res.status).toBe(200);
    expect(seen).toContain("fw_hno_1");
  });

  it("returns 401 on a tampered signature", async () => {
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
    const app = new Hono();
    app.post("/webhooks/pay", webhookHandler(pay, { onEvent: () => {} }));

    const res = await app.request(signedRequest(sign(RAW, "wrong")));
    expect(res.status).toBe(401);
  });

  it("returns 400 on a malformed body (signature valid, JSON invalid)", async () => {
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
    const app = new Hono();
    app.post("/webhooks/pay", webhookHandler(pay, { onEvent: () => {} }));

    const malformed = "{not-json";
    const res = await app.request(signedRequest(sign(malformed, SECRET), malformed));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the handler throws (provider will retry)", async () => {
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
    const app = new Hono();
    app.post(
      "/webhooks/pay",
      webhookHandler(pay, {
        onEvent: () => {
          throw new Error("fulfilment exploded");
        },
      }),
    );

    const res = await app.request(signedRequest());
    expect(res.status).toBe(500);
  });
});
