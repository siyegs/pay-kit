import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { createPayClient } from "../client";
import {
  constructWebhookFromRequest,
  rawBodyString,
  webhookMiddleware,
  type WebhookRequest,
  type WebhookResponse,
} from "../adapters/express";

const SECRET = "sk_test_secret";
const pay = createPayClient({ provider: "paystack", secretKey: SECRET });

const RAW = JSON.stringify({
  event: "charge.success",
  data: { reference: "ref_123", status: "success", amount: 500000, currency: "NGN" },
});
const SIG = createHmac("sha512", SECRET).update(RAW).digest("hex");

/** A stream-backed request, like Express before any body parser ran. */
function streamingRequest(): WebhookRequest {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const req: WebhookRequest = {
    headers: { "x-paystack-signature": SIG },
    on(event, cb) {
      const list = listeners.get(event) ?? [];
      list.push(cb as (...args: unknown[]) => void);
      listeners.set(event, list);
      return req;
    },
  };
  queueMicrotask(() => {
    for (const cb of listeners.get("data") ?? []) cb(Buffer.from(RAW));
    for (const cb of listeners.get("end") ?? []) cb();
  });
  return req;
}

/** A request whose body was already buffered (e.g. by `express.raw()`). */
function bufferedRequest(body: unknown, headers: Record<string, string> = { "x-paystack-signature": SIG }): WebhookRequest {
  return { headers, body, on: () => undefined } as WebhookRequest;
}

function fakeResponse() {
  let status: number | undefined;
  const res: WebhookResponse = { sendStatus: (code) => void (status = code) };
  return { res, status: () => status };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("express adapter: rawBodyString", () => {
  it("collects the raw body from the request stream", async () => {
    expect(await rawBodyString(streamingRequest())).toBe(RAW);
  });

  it("uses a Buffer body from express.raw()", async () => {
    expect(await rawBodyString(bufferedRequest(Buffer.from(RAW)))).toBe(RAW);
  });

  it("rejects a JSON-parsed object body - the raw bytes are already lost", async () => {
    await expect(rawBodyString(bufferedRequest({ event: "charge.success" }))).rejects.toMatchObject({
      code: "config_error",
    });
  });
});

describe("express adapter: constructWebhookFromRequest", () => {
  it("verifies a real signed request and normalizes the event", async () => {
    const event = await constructWebhookFromRequest(pay, streamingRequest());
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("ref_123");
    expect(event.amount).toBe(500000);
  });
});

describe("express adapter: webhookMiddleware", () => {
  it("returns 200 and dispatches the event on a valid webhook", async () => {
    let seen: string | undefined;
    const res = fakeResponse();
    webhookMiddleware(pay, { onEvent: (e) => void (seen = e.reference) })(streamingRequest(), res.res);
    await tick();
    expect(res.status()).toBe(200);
    expect(seen).toBe("ref_123");
  });

  it("returns 401 on a bad signature and never calls onEvent", async () => {
    let called = false;
    const res = fakeResponse();
    webhookMiddleware(pay, { onEvent: () => void (called = true) })(
      bufferedRequest(Buffer.from(RAW), { "x-paystack-signature": "forged" }),
      res.res,
    );
    await tick();
    expect(res.status()).toBe(401);
    expect(called).toBe(false);
  });

  it("returns 400 on a JSON-parsed body (raw bytes lost)", async () => {
    const res = fakeResponse();
    webhookMiddleware(pay, { onEvent: () => {} })(
      bufferedRequest({ event: "charge.success" }, { "x-paystack-signature": SIG }),
      res.res,
    );
    await tick();
    expect(res.status()).toBe(400);
  });

  it("returns 500 when the handler throws (so the provider retries)", async () => {
    const res = fakeResponse();
    webhookMiddleware(pay, {
      onEvent: () => {
        throw new Error("db down");
      },
    })(streamingRequest(), res.res);
    await tick();
    expect(res.status()).toBe(500);
  });

  it("reports failures to onError", async () => {
    const errors: unknown[] = [];
    const res = fakeResponse();
    webhookMiddleware(pay, { onEvent: () => {}, onError: (err) => errors.push(err) })(
      bufferedRequest(Buffer.from(RAW), { "x-paystack-signature": "forged" }),
      res.res,
    );
    await tick();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "invalid_signature" });
  });
});
