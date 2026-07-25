/**
 * Two-phase live-sandbox verification for the methods that need a *paid* charge.
 *
 * The plain `bun run integration` harness only starts a charge, so it never
 * reaches "success" and can't exercise refund / chargeAuthorization / splits.
 * This script closes that gap: you complete one real test-mode payment in the
 * browser, then it verifies the paid-charge methods against the live sandbox.
 *
 *   1. bun run scripts/verify-charge.ts init paystack
 *        -> prints a checkout URL, saves the reference locally
 *
 *   2. open the URL, pay with the provider's TEST card:
 *        Paystack:    4084 0840 8408 4081  CVV 408  exp 12/30  PIN 0000  OTP 123456
 *        Flutterwave: 5531 8866 5214 6605  CVV 564  exp 09/32  PIN 3310  OTP 12345
 *
 *   3. bun run scripts/verify-charge.ts confirm paystack
 *        -> verify (expects success) -> chargeAuthorization -> refund
 *
 * A webhook signature self-check needs no browser step:
 *
 *   bun run scripts/verify-charge.ts webhook paystack
 *
 * Keys come from a gitignored `.env` (Bun auto-loads it). Amounts are subunits.
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPayClient, PayKitError } from "../src";
import type { PayClientConfig, ProviderName } from "../src";

const STATE_FILE = join(import.meta.dir, "..", ".paykit-verify.json");
const EMAIL = "verify@pay-kit.dev";

type State = Record<string, { reference: string; email: string }>;

function loadState(): State {
  if (!existsSync(STATE_FILE)) return {};
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
}
function saveState(state: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function configFor(provider: ProviderName): PayClientConfig {
  if (provider === "paystack") {
    const secretKey = requireEnv("PAYSTACK_SECRET_KEY");
    return { provider, secretKey };
  }
  if (provider === "flutterwave") {
    const secretKey = requireEnv("FLUTTERWAVE_SECRET_KEY");
    return { provider, secretKey, webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_HASH };
  }
  throw new Error(`Unsupported provider for live verification: ${provider}`);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} in .env - copy .env.example and fill your TEST keys.`);
    process.exit(1);
  }
  return v;
}

function pass(step: string, detail = ""): void {
  console.log(`  PASS  ${step.padEnd(20)} ${detail}`);
}
function fail(step: string, detail = ""): never {
  console.log(`  FAIL  ${step.padEnd(20)} ${detail}`);
  process.exit(1);
}
function warn(step: string, detail = ""): void {
  console.log(`  WARN  ${step.padEnd(20)} ${detail}`);
}

async function init(provider: ProviderName): Promise<void> {
  const pay = createPayClient(configFor(provider));
  const reference = `pk_verify_${provider}_${Date.now()}`;
  const r = await pay.initialize({
    amount: 500000, // NGN 5,000.00
    email: EMAIL,
    reference,
    callbackUrl: "https://example.com/pay-kit/callback",
  });

  const state = loadState();
  state[provider] = { reference: r.reference, email: EMAIL };
  saveState(state);

  console.log(`\n=== ${provider.toUpperCase()} — pay this test charge ===`);
  console.log(`  reference: ${r.reference}`);
  console.log(`  checkout:  ${r.authorizationUrl}\n`);
  console.log("Open the URL, pay with the provider's TEST card (see this file's header),");
  console.log(`then run:  bun run scripts/verify-charge.ts confirm ${provider}`);
}

async function confirm(provider: ProviderName): Promise<void> {
  const state = loadState();
  const saved = state[provider];
  if (!saved) {
    fail("state", `no saved charge for ${provider} - run 'init ${provider}' first.`);
  }
  const pay = createPayClient(configFor(provider));
  console.log(`\n=== ${provider.toUpperCase()} — verifying paid-charge methods ===`);

  // 1. verify — must be success, or the payment wasn't completed.
  const v = await pay.verify(saved.reference);
  if (v.status !== "success") {
    fail("verify", `status=${v.status} (complete the checkout in the browser first, then re-run confirm).`);
  }
  pass("verify", `status=success amount=${v.amount} ${v.currency}`);

  // 2. chargeAuthorization — reuse the saved-card token from the paid charge.
  // Use the email the provider actually recorded on the charge, not the one we
  // sent: Flutterwave's sandbox rewrites the email, and the saved token is tied
  // to the recorded email (Paystack keeps ours, so this is a safe default both ways).
  if (!v.authorization) {
    warn("chargeAuthorization", "no saved-card token on this charge (pay with a CARD to exercise it).");
  } else {
    const chargeEmail = v.customer?.email ?? saved.email;
    try {
      const c = await pay.chargeAuthorization({
        authorizationCode: v.authorization,
        email: chargeEmail,
        amount: 100000, // NGN 1,000.00
        callbackUrl: "https://example.com/pay-kit/callback",
      });
      pass("chargeAuthorization", `status=${c.status} amount=${c.amount}`);
    } catch (err) {
      warn("chargeAuthorization", describe(err));
    }
  }

  // 3. refund — full refund of the original paid charge.
  try {
    const rf = await pay.refund(saved.reference);
    pass("refund", `status=${rf.status} amount=${rf.amount ?? "(full)"}`);
  } catch (err) {
    warn("refund", describe(err));
  }

  console.log("\nDone. Update the README Status section for any step that PASSed.");
}

/**
 * Deterministic webhook signature check — no browser step. Builds a payload,
 * signs it the way the provider would, and confirms `construct` accepts a valid
 * signature and rejects a tampered one.
 */
function webhook(provider: ProviderName): void {
  const cfg = configFor(provider);
  const pay = createPayClient(cfg);
  console.log(`\n=== ${provider.toUpperCase()} — webhook signature check ===`);

  let body: string;
  let goodSig: string;
  if (provider === "paystack") {
    body = JSON.stringify({
      event: "charge.success",
      data: { reference: "pk_wh_test", amount: 500000, currency: "NGN", status: "success" },
    });
    goodSig = createHmac("sha512", (cfg as { secretKey: string }).secretKey).update(body).digest("hex");
  } else {
    const hash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
    if (!hash) {
      warn("webhook", "set FLUTTERWAVE_WEBHOOK_HASH in .env to check Flutterwave webhooks.");
      return;
    }
    body = JSON.stringify({
      event: "charge.completed",
      data: { tx_ref: "pk_wh_test", amount: 5000, currency: "NGN", status: "successful" },
    });
    goodSig = hash;
  }

  // Valid signature -> normalized event.
  const ev = pay.webhooks.construct(body, goodSig);
  if (!ev.type) fail("construct(valid)", "no event type returned");
  pass("construct(valid)", `type=${ev.type} ref=${ev.reference} amount=${ev.amount}`);

  // Tampered signature -> must throw.
  try {
    pay.webhooks.construct(body, goodSig.slice(0, -2) + "00");
    fail("reject(tampered)", "accepted an invalid signature (SECURITY BUG)");
  } catch (err) {
    if (err instanceof PayKitError && err.code === "invalid_signature") {
      pass("reject(tampered)", "invalid signature rejected");
    } else {
      fail("reject(tampered)", describe(err));
    }
  }
}

function describe(err: unknown): string {
  if (err instanceof PayKitError) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Create a connected subaccount against the live sandbox. Needs a settlement
 * bank + account: reuse the per-provider resolve vars from `.env`
 * (`PAYSTACK_RESOLVE_ACCOUNT`/`_BANK`, `FLUTTERWAVE_RESOLVE_ACCOUNT`/`_BANK`).
 */
async function subaccount(provider: ProviderName): Promise<void> {
  const up = provider.toUpperCase();
  const accountNumber = process.env[`${up}_RESOLVE_ACCOUNT`] ?? process.env.RESOLVE_ACCOUNT;
  const bankCode = process.env[`${up}_RESOLVE_BANK`] ?? process.env.RESOLVE_BANK;
  console.log(`\n=== ${provider.toUpperCase()} — createSubaccount ===`);
  if (!accountNumber || !bankCode) {
    warn("createSubaccount", `set ${up}_RESOLVE_ACCOUNT and ${up}_RESOLVE_BANK in .env to test this.`);
    return;
  }

  const pay = createPayClient(configFor(provider));
  try {
    const sub = await pay.createSubaccount({
      businessName: "pay-kit test vendor",
      bankCode,
      accountNumber,
      percentageCharge: 20,
      email: "vendor@pay-kit.dev",
    });
    if (!sub.id) fail("createSubaccount", "no subaccount id returned");
    pass("createSubaccount", `id=${sub.id}`);
    console.log(`\nUse this id in a split charge to verify splits end to end:`);
    console.log(`  split: { subaccount: "${sub.id}" }`);
  } catch (err) {
    warn("createSubaccount", describe(err));
  }
}

const [command, providerArg] = process.argv.slice(2);
const provider = providerArg as ProviderName;

if (!command || !["init", "confirm", "webhook", "subaccount"].includes(command) || !provider) {
  console.log("Usage:");
  console.log("  bun run scripts/verify-charge.ts init       <paystack|flutterwave>");
  console.log("  bun run scripts/verify-charge.ts confirm    <paystack|flutterwave>");
  console.log("  bun run scripts/verify-charge.ts webhook    <paystack|flutterwave>");
  console.log("  bun run scripts/verify-charge.ts subaccount <paystack|flutterwave>");
  process.exit(1);
}

if (command === "init") await init(provider);
else if (command === "confirm") await confirm(provider);
else if (command === "subaccount") await subaccount(provider);
else webhook(provider);
