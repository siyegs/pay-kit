/**
 * Smoke test: import the built dist (not source) and verify every public entry
 * point resolves and works at runtime. Catches broken `exports` maps, missing
 * files, or CJS/ESM interop issues before publish.
 *
 *   bun run test:dist
 */

import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---- CJS build (consumed via require()) ----
const cjsIndex = require("../dist/index.cjs") as {
  createPayClient: typeof createPayClient;
  PayKitError: typeof PayKitError;
};
const cjsExpress = require("../dist/express.cjs") as { webhookMiddleware: unknown };
const cjsHono = require("../dist/hono.cjs") as { webhookHandler: unknown };
const cjsFastify = require("../dist/fastify.cjs") as { webhookPlugin: unknown };
const cjsNext = require("../dist/next.cjs") as { webhookRoute: unknown };
const cjsNestjs = require("../dist/nestjs.cjs") as { PayKitModule: unknown; InjectPayClient: unknown };

// ---- main entry ----
import { createPayClient, createFallbackClient, isRetryableError, PayKitError } from "../dist/index.js";

// ---- subpath entries ----
import {
  constructWebhookFromRequest as expressConstruct,
  rawBodyString,
  webhookMiddleware,
} from "../dist/express.js";
import { constructWebhookFromRequest as honoConstruct, webhookHandler } from "../dist/hono.js";
import { constructWebhookFromRequest as fastifyConstruct, webhookPlugin } from "../dist/fastify.js";
import { constructWebhookFromRequest as nextConstruct, webhookRoute } from "../dist/next.js";
import { InjectPayClient, PayKitModule } from "../dist/nestjs.js";

// ----- constants -----
const RAW = JSON.stringify({
  event: "charge.success",
  data: { reference: "smoke_ref", status: "success", amount: 500000, currency: "NGN" },
});

// ----- helpers -----

/** Emulates an Express request with streaming events (before body parsing). */
function expressStreamingRequest(): any {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const req: any = {
    headers: { "x-paystack-signature": "any", "content-type": "application/json" },
    on(event: string, cb: (...args: unknown[]) => void) {
      const lst = listeners.get(event) ?? [];
      lst.push(cb);
      listeners.set(event, lst);
      return req;
    },
  };
  queueMicrotask(() => {
    for (const cb of listeners.get("data") ?? []) cb(Buffer.from(RAW));
    for (const cb of listeners.get("end") ?? []) cb();
  });
  return req;
}

// ----- tests -----

describe("smoke: main entry", () => {
  it("createPayClient(mock) runs init -> verify lifecycle", async () => {
    const pay = createPayClient({ provider: "mock" });
    const init = await pay.initialize({ amount: 500000, email: "a@b.com" });
    expect(init.authorizationUrl).toContain("/checkout/");
    const verified = await pay.verify(init.reference);
    expect(verified.status).toBe("success");
  });

  it("createFallbackClient fails gracefully against dead endpoints", async () => {
    const fb = createFallbackClient({
    providers: [
      { provider: "paystack", secretKey: "sk_fake", baseUrl: "http://127.0.0.1:19999", timeout: 500 },
      { provider: "flutterwave", secretKey: "FLWSECK_fake", baseUrl: "http://127.0.0.1:19999", timeout: 500 },
    ],
  });
    await expect(fb.initialize({ amount: 100, email: "x@x.com" })).rejects.toThrow(PayKitError);
  });

  it("isRetryableError checks known codes", () => {
    expect(isRetryableError(new PayKitError("t", { code: "timeout" }))).toBe(true);
    expect(isRetryableError(new PayKitError("c", { code: "config_error" }))).toBe(false);
  });
});

describe("smoke: CJS build loads and works (require)", () => {
  it("index.cjs: named exports are present and a mock client runs", async () => {
    expect(typeof cjsIndex.createPayClient).toBe("function");
    expect(typeof cjsIndex.PayKitError).toBe("function");
    const pay = cjsIndex.createPayClient({ provider: "mock" });
    const init = await pay.initialize({ amount: 100, email: "cjs@test.dev" });
    expect((await pay.verify(init.reference)).status).toBe("success");
  });

  it("all subpath .cjs files expose their entry functions", () => {
    expect(typeof cjsExpress.webhookMiddleware).toBe("function");
    expect(typeof cjsHono.webhookHandler).toBe("function");
    expect(typeof cjsFastify.webhookPlugin).toBe("function");
    expect(typeof cjsNext.webhookRoute).toBe("function");
    expect(cjsNestjs.PayKitModule).toBeDefined();
    expect(cjsNestjs.InjectPayClient).toBeDefined();
  });
});

describe("smoke: subpath exports resolve", () => {
  it("Express: webhookMiddleware, rawBodyString, constructWebhookFromRequest are functions", () => {
    expect(typeof webhookMiddleware).toBe("function");
    expect(typeof rawBodyString).toBe("function");
    expect(typeof expressConstruct).toBe("function");
  });

  it("Hono: webhookHandler, constructWebhookFromRequest are functions", () => {
    expect(typeof webhookHandler).toBe("function");
    expect(typeof honoConstruct).toBe("function");
  });

  it("Fastify: webhookPlugin, constructWebhookFromRequest are functions", () => {
    expect(typeof webhookPlugin).toBe("function");
    expect(typeof fastifyConstruct).toBe("function");
  });

  it("Next: webhookRoute, constructWebhookFromRequest are functions", () => {
    expect(typeof webhookRoute).toBe("function");
    expect(typeof nextConstruct).toBe("function");
  });

  it("NestJS: PayKitModule and InjectPayClient are defined", () => {
    expect(PayKitModule).toBeDefined();
    expect(InjectPayClient).toBeDefined();
  });
});

describe("smoke: webhook construct (local, no network)", () => {
  // The mock provider accepts any non-empty signature - perfect for verifying
  // the built adapters wire client -> provider -> event correctly.
  const pay = createPayClient({ provider: "mock" });

  it("Express: constructWebhookFromRequest streams the body and normalises", async () => {
    const req = expressStreamingRequest();
    const event = await expressConstruct(pay, req);
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("smoke_ref");
    expect(event.amount).toBe(500000);
  });

  it("Express: webhookMiddleware replies 200 on a valid signature", async () => {
    const res = { sendStatus: (code: number) => (void (status = code)) };
    let status: number | undefined;
    const middleware = webhookMiddleware(pay, { onEvent: () => {} });
    await middleware(expressStreamingRequest(), res);
    await new Promise((r) => setTimeout(r, 10));
    expect(status).toBe(200);
  });

  it("Hono: constructWebhookFromRequest verifies a Fetch Request", async () => {
    const req = new Request("https://app.test/wh", {
      method: "POST",
      headers: { "x-paystack-signature": "any", "content-type": "application/json" },
      body: RAW,
    });
    const event = await honoConstruct(pay, req);
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("smoke_ref");
  });

  it("Hono: webhookHandler returns 200 on a valid webhook", async () => {
    let seen: string | undefined;
    const handle = webhookHandler(pay, { onEvent: (e) => void (seen = e.reference) });
    const req = new Request("https://app.test/wh", {
      method: "POST",
      headers: { "x-paystack-signature": "any", "content-type": "application/json" },
      body: RAW,
    });
    const res = await handle({ req: { raw: req } });
    expect(res.status).toBe(200);
    expect(seen).toBe("smoke_ref");
  });

  it("Fastify: constructWebhookFromRequest reads the raw body string", () => {
    const event = fastifyConstruct(pay, {
      body: RAW,
      headers: { "x-paystack-signature": "any" },
    });
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("smoke_ref");
  });

  it("Fastify: webhookPlugin registers the raw-body parsers and the POST route", () => {
    const fastify = {
      addContentTypeParser: (...args: unknown[]) => {
        if (Array.isArray(args[0])) {
          expect(args[0]).toEqual(["application/json", "text/plain"]);
          expect(args[1]).toEqual({ parseAs: "string" });
        } else {
          expect(args[0]).toBe("*/*");
          expect(args[1]).toEqual({ parseAs: "string" });
        }
      },
      post: (path: string) => {
        expect(path).toBe("/webhooks/pay");
      },
    };
    webhookPlugin(pay, { onEvent: () => {} })(fastify);
  });

  it("Next: constructWebhookFromRequest verifies a Fetch Request", async () => {
    const req = new Request("https://app.test/wh", {
      method: "POST",
      headers: { "x-paystack-signature": "any", "content-type": "application/json" },
      body: RAW,
    });
    const event = await nextConstruct(pay, req);
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("smoke_ref");
  });

  it("Next: webhookRoute replies 200 on a valid webhook", async () => {
    const handler = webhookRoute(pay, { onEvent: () => {} });
    const req = new Request("https://app.test/wh", {
      method: "POST",
      headers: { "x-paystack-signature": "any", "content-type": "application/json" },
      body: RAW,
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
  });
});