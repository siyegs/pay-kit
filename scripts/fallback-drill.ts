/**
 * Real fallback drill: exercise `createFallbackClient` against the LIVE
 * sandboxes with one provider intentionally dead (a localhost port that
 * nothing listens on), proving the fall-through works end to end - not just
 * against mocked failures.
 *
 *   bun run fallback-drill
 *
 * Keys are read from `.env` (Bun auto-loads it). Requires at least one real
 * TEST key. Only creates an unpaid test-mode charge - no money moves.
 */
import { createFallbackClient, PayKitError } from "../src";
import { isRetryableError } from "../src/errors";

const DEAD = "http://127.0.0.1:19999"; // nothing listens here

const paystackKey = process.env.PAYSTACK_SECRET_KEY;
const flwKey = process.env.FLUTTERWAVE_SECRET_KEY;

if (!paystackKey && !flwKey) {
  console.log("No test keys found. Copy .env.example to .env first.");
  process.exit(0);
}

let failures = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(42)} ${detail}`);
  if (!ok) failures++;
}
/** Environmental warnings don't fail the drill (e.g. unpaid-charge lookup). */
function warn(name: string, detail: string): void {
  console.log(`  WARN  ${name.padEnd(42)} ${detail}`);
}

const email = "fallback@pay-kit.dev";

async function drill(label: string, providers: Parameters<typeof createFallbackClient>[0]["providers"]) {
  console.log(`\n=== ${label} ===`);
  const fallback = createFallbackClient({ providers });

  try {
    const init = await fallback.initialize({
      amount: 500000,
      email,
      reference: `pk_fb_${Date.now()}`,
      callbackUrl: "https://example.com/pay-kit/callback",
    });
    check(`initialize -> provider=${init.provider}`, true, `ref=${init.reference}`);

    // Route verify back to the provider that succeeded (real provider, real ref).
    // An UNPAID charge legitimately has no transaction record on Flutterwave,
    // so this is a warning, not a failure.
    try {
      const verified = await fallback.verify(init.provider, init.reference);
      check(`verify(${init.provider})`, true, `status=${verified.status}`);
    } catch (err) {
      warn(`verify(${init.provider})`, err instanceof Error ? err.message : String(err));
    }
  } catch (err) {
    check(`initialize`, false, err instanceof Error ? err.message : String(err));
  }
}

// Live + dead: must fall through to the live provider.
if (paystackKey) {
  await drill("paystack live, flutterwave dead", [
    { provider: "paystack", secretKey: paystackKey },
    { provider: "flutterwave", secretKey: "FLWSECK_TEST-fake", baseUrl: DEAD, timeout: 2000 },
  ]);
}
if (flwKey) {
  await drill("flutterwave live, paystack dead", [
    { provider: "flutterwave", secretKey: flwKey, webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_HASH },
    { provider: "paystack", secretKey: "sk_test_fake", baseUrl: DEAD, timeout: 2000 },
  ]);
}

// Both dead: must throw a PayKitError after exhausting providers.
if (paystackKey || flwKey) {
  console.log("\n=== both dead (expect failure) ===");
  const fallback = createFallbackClient({
    providers: [
      { provider: "paystack", secretKey: paystackKey ?? "sk_test_fake", baseUrl: DEAD, timeout: 1000 },
      { provider: "flutterwave", secretKey: flwKey ?? "FLWSECK_TEST-fake", baseUrl: DEAD, timeout: 1000 },
    ],
  });
  try {
    await fallback.initialize({ amount: 100, email, callbackUrl: "https://example.com/cb" });
    check("both dead throws", false, "no error thrown");
  } catch (err) {
    const isPayKit = err instanceof PayKitError;
    const retryable = isRetryableError(err);
    check(
      "both dead throws",
      isPayKit,
      `${err instanceof Error ? err.constructor.name : typeof err} code=${(err as PayKitError).code}`,
    );
    check("last error is retryable", retryable, `isRetryableError=${retryable}`);
  }
}

console.log(`\n${failures === 0 ? "ALL DRILLS PASSED" : `${failures} drill step(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
