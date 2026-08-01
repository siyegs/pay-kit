import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { createPayClient } from "../client";
import {
  constructWebhookFromRequest,
  webhookPlugin,
  type FastifyLike,
} from "../adapters/fastify";

const SECRET = "sk_test_secret";
const pay = createPayClient({ provider: "paystack", secretKey: SECRET });

const RAW = JSON.stringify({
  event: "charge.success",
  data: { reference: "ref_123", status: "success", amount: 500000, currency: "NGN" },
});
const SIG = createHmac("sha512", SECRET).update(RAW).digest("hex");

/** A fake Fastify instance capturing the parser and the registered route. */
function fakeFastify() {
  let parser: { contentType: string; opts: unknown; fn: unknown } | undefined;
  let route: { path: string; handler: unknown } | undefined;
  const fastify = {
    addContentTypeParser: (
      contentType: string,
      opts: { parseAs: "string" },
      fn: (request: unknown, body: string, done: (error: Error | null, value?: string) => void) => void,
    ) => {
      parser = { contentType, opts, fn };
    },
    post: (path: string, handler: unknown) => {
      route = { path, handler };
    },
  };
  return {
    fastify: fastify as FastifyLike,
    parser: () => parser,
    route: () => route,
  };
}

function fakeReply() {
  let status = 200;
  let sent: unknown;
  const reply = {
    code: (n: number) => {
      status = n;
      return reply;
    },
    send: (payload: unknown) => {
      sent = payload;
      return reply;
    },
  };
  return { reply, status: () => status, sent: () => sent };
}

function signedRequest() {
  return { body: RAW, headers: { "x-paystack-signature": SIG } };
}

describe("fastify adapter: webhookPlugin registration", () => {
  it("registers a */* string content-type parser for the raw body", () => {
    const app = fakeFastify();
    webhookPlugin(pay, { onEvent: () => {} })(app.fastify);

    const parser = app.parser();
    expect(parser?.contentType).toBe("*/*");
    expect(parser?.opts).toEqual({ parseAs: "string" });
    const done = { called: false };
    (parser!.fn as (r: unknown, b: string, d: (err: Error | null, v?: string) => void) => void)(
      {},
      RAW,
      (err, value) => {
        expect(err).toBeNull();
        expect(value).toBe(RAW);
        done.called = true;
      },
    );
    expect(done.called).toBe(true);
  });

  it("registers the webhook route at the default path", () => {
    const app = fakeFastify();
    webhookPlugin(pay, { onEvent: () => {} })(app.fastify);
    expect(app.route()?.path).toBe("/webhooks/pay");
  });

  it("respects a custom path", () => {
    const app = fakeFastify();
    webhookPlugin(pay, { onEvent: () => {}, path: "/hooks/pay" })(app.fastify);
    expect(app.route()?.path).toBe("/hooks/pay");
  });
});

describe("fastify adapter: route behavior", () => {
  const callRoute = async (options: Parameters<typeof webhookPlugin>[1], request: unknown) => {
    const app = fakeFastify();
    webhookPlugin(pay, options)(app.fastify);
    const reply = fakeReply();
    const handler = app.route()!.handler as (req: unknown, res: unknown) => Promise<unknown>;
    const result = await handler(request, reply.reply);
    return { reply, result };
  };

  it("returns 200 and dispatches the event on a valid webhook", async () => {
    let seen: string | undefined;
    const { reply, result } = await callRoute(
      { onEvent: (e) => void (seen = e.reference) },
      signedRequest(),
    );
    expect(reply.status()).toBe(200);
    expect(seen).toBe("ref_123");
    expect(result).toEqual({ received: true });
  });

  it("returns 401 on a bad signature and never calls onEvent", async () => {
    let called = false;
    const { reply } = await callRoute(
      { onEvent: () => void (called = true) },
      { body: RAW, headers: { "x-paystack-signature": "forged" } },
    );
    expect(reply.status()).toBe(401);
    expect(called).toBe(false);
  });

  it("returns 500 when the handler throws (so the provider retries)", async () => {
    const { reply } = await callRoute(
      {
        onEvent: () => {
          throw new Error("db down");
        },
      },
      signedRequest(),
    );
    expect(reply.status()).toBe(500);
  });

  it("reports failures to onError", async () => {
    const errors: unknown[] = [];
    const { reply } = await callRoute(
      { onEvent: () => {}, onError: (err) => errors.push(err) },
      { body: RAW, headers: { "x-paystack-signature": "forged" } },
    );
    expect(reply.status()).toBe(401);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "invalid_signature" });
  });
});

describe("fastify adapter: constructWebhookFromRequest", () => {
  it("verifies a real signed request and normalizes the event", () => {
    const event = constructWebhookFromRequest(pay, signedRequest());
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("ref_123");
    expect(event.amount).toBe(500000);
  });
});
