/**
 * Node ESM consumer smoke: load the built package exactly like a Node ESM
 * consumer would (`import ... from "@siyegs/pay-kit"`), and exercise the
 * subpath entries. Run with `node`, NOT Bun:
 *
 *   node scripts/node-smoke.mjs
 */
import assert from "node:assert";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const load = (file) => import(pathToFileURL(path.join(dist, file)).href);

const {
  createPayClient,
  createFallbackClient,
  PayKitError,
  isRetryableError,
} = await load("index.js");
const { webhookMiddleware } = await load("express.js");
const { webhookHandler } = await load("hono.js");
const { webhookPlugin } = await load("fastify.js");
const { webhookRoute } = await load("next.js");
const { PayKitModule, InjectPayClient } = await load("nestjs.js");

assert.strictEqual(typeof webhookMiddleware, "function");
assert.strictEqual(typeof webhookHandler, "function");
assert.strictEqual(typeof webhookPlugin, "function");
assert.strictEqual(typeof webhookRoute, "function");
assert.ok(PayKitModule && InjectPayClient);

const pay = createPayClient({ provider: "mock" });
const init = await pay.initialize({ amount: 500000, email: "node-esm@test.dev" });
assert.ok(init.reference);
const verified = await pay.verify(init.reference);
assert.strictEqual(verified.status, "success");
console.log("ESM: main entry + all 5 subpaths resolve, mock lifecycle OK");

const fallback = createFallbackClient({
  providers: [
    { provider: "paystack", secretKey: "sk_fake", baseUrl: "http://127.0.0.1:19999", timeout: 300 },
    { provider: "flutterwave", secretKey: "FLWSECK_fake", baseUrl: "http://127.0.0.1:19999", timeout: 300 },
  ],
});
await assert.rejects(
  fallback.initialize({ amount: 100, email: "a@b.com" }),
  (err) => err instanceof PayKitError,
);
assert.strictEqual(isRetryableError(new PayKitError("t", { code: "timeout" })), true);
console.log("ESM: fallback + isRetryableError OK");

// The require-condition files exist and load under Node too.
const require = createRequire(import.meta.url);
const cjs = require(path.join(dist, "index.cjs"));
assert.strictEqual(typeof cjs.createPayClient, "function");
console.log("ESM: require() of the CJS build still works under Node OK");

console.log("node-smoke.mjs PASSED");
