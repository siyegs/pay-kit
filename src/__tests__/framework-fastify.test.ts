/**
 * Real-framework tests: register the Fastify webhook plugin on an actual
 * Fastify instance and verify the headline claim - the catch-all raw-body
 * parser lives in the plugin's encapsulated scope, so OTHER routes keep
 * Fastify's default JSON parsing - plus status codes.
 */
import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { createPayClient } from "../client";
import { webhookPlugin } from "../adapters/fastify";

const SECRET = "sk_test_framework";
const PAYLOAD = {
  event: "charge.success",
  data: { reference: "fw_fst_1", status: "success", amount: 500000, currency: "NGN" },
};
const RAW = JSON.stringify(PAYLOAD);

function sign(raw: string, key: string): string {
  return createHmac("sha512", key).update(raw).digest("hex");
}

async function buildApp(onEvent: (e: { reference: string }) => void) {
  const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
  const app = Fastify();
  await app.register(webhookPlugin(pay, { onEvent, path: "/webhooks/pay" }));
  // A normal JSON route - must keep Fastify's default parsing.
  app.post("/api/echo", async (req) => ({ got: req.body }));
  await app.ready();
  return app;
}

describe("fastify adapter: real server", () => {
  it("returns 200 and dispatches the event on a valid webhook", async () => {
    const seen: string[] = [];
    const app = await buildApp((e) => void seen.push(e.reference));

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/pay",
      headers: { "content-type": "application/json", "x-paystack-signature": sign(RAW, SECRET) },
      payload: RAW,
    });

    expect(res.statusCode).toBe(200);
    expect(seen).toContain("fw_fst_1");
    await app.close();
  });

  it("returns 401 on a tampered signature", async () => {
    const app = await buildApp(() => {});
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/pay",
      headers: { "content-type": "application/json", "x-paystack-signature": sign(RAW, "nope") },
      payload: RAW,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on a malformed body (signature valid, JSON invalid)", async () => {
    const app = await buildApp(() => {});
    const malformed = "{not-json";
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/pay",
      headers: { "content-type": "application/json", "x-paystack-signature": sign(malformed, SECRET) },
      payload: malformed,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 500 when the handler throws (provider will retry)", async () => {
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
    const app = Fastify();
    await app.register(
      webhookPlugin(pay, {
        onEvent: () => {
          throw new Error("fulfilment exploded");
        },
      }),
    );
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/pay",
      headers: { "content-type": "application/json", "x-paystack-signature": sign(RAW, SECRET) },
      payload: RAW,
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it("keeps the catch-all raw parser INSIDE the plugin scope: other routes parse JSON normally", async () => {
    const app = await buildApp(() => {});

    // The webhook route receives the RAW body string (that's the point).
    const webhook = await app.inject({
      method: "POST",
      url: "/webhooks/pay",
      headers: { "content-type": "application/json", "x-paystack-signature": sign(RAW, SECRET) },
      payload: RAW,
    });
    expect(webhook.statusCode).toBe(200);

    // And the sibling route still gets a parsed object - not a string.
    const echo = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ hello: "world", n: 42 }),
    });
    expect(echo.statusCode).toBe(200);
    expect(echo.json() as unknown).toEqual({ got: { hello: "world", n: 42 } });

    await app.close();
  });
});
