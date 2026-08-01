/**
 * Node CJS consumer smoke: load the built package exactly like a Node
 * CommonJS consumer would (`require("@siyegs/pay-kit")`), and run a mock
 * lifecycle. Run with `node`, NOT Bun:
 *
 *   node scripts/node-smoke.cjs
 */
"use strict";

const assert = require("node:assert");
const path = require("node:path");

const dist = path.resolve(__dirname, "..", "dist");

// Same resolution a consumer gets through the "require" condition.
const { createPayClient, createFallbackClient, PayKitError, isRetryableError } = require(path.join(dist, "index.cjs"));

async function main() {
  const pay = createPayClient({ provider: "mock" });
  const init = await pay.initialize({ amount: 500000, email: "node-cjs@test.dev" });
  assert.ok(init.reference, "initialize returned a reference");
  const verified = await pay.verify(init.reference);
  assert.strictEqual(verified.status, "success");
  assert.strictEqual(verified.amount, 500000);
  console.log("CJS: mock init->verify lifecycle OK");

  const fallback = createFallbackClient({
    providers: [
      { provider: "paystack", secretKey: "sk_fake", baseUrl: "http://127.0.0.1:19999", timeout: 300 },
      { provider: "flutterwave", secretKey: "FLWSECK_fake", baseUrl: "http://127.0.0.1:19999", timeout: 300 },
    ],
  });
  await assert.rejects(
    fallback.initialize({ amount: 100, email: "a@b.com" }),
    (err) => err instanceof PayKitError,
    "fallback throws PayKitError when all providers are down",
  );
  assert.strictEqual(isRetryableError(new PayKitError("t", { code: "timeout" })), true);
  console.log("CJS: fallback + isRetryableError OK");
}

main().then(
  () => console.log("node-smoke.cjs PASSED"),
  (err) => {
    console.error("node-smoke.cjs FAILED:", err);
    process.exit(1);
  },
);
