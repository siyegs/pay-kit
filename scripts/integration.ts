/**
 * Live-sandbox integration checks.
 *
 * Runs the real SDK against the real Paystack / Flutterwave TEST sandboxes so we
 * can confirm endpoint paths and field mappings match live behavior (the unit
 * tests only use mocked responses).
 *
 *   bun run integration
 *
 * Keys are read from `.env` (Bun auto-loads it; `.env` is gitignored - never
 * commit real keys). Copy `.env.example` to `.env` and fill in your TEST keys.
 *
 * Safe by default: only reads and creates a single test-mode charge (no money
 * moves). To also exercise a test-mode payout, set RUN_TRANSFERS=1 and provide
 * RESOLVE_ACCOUNT + RESOLVE_BANK.
 */
import { createPayClient } from "../src";
import type { PayClientConfig, ProviderName } from "../src";

interface Step {
  name: string;
  run: () => Promise<unknown>;
  /** Soft steps warn instead of failing the run (expected-to-vary in sandbox). */
  soft?: boolean;
}

const results: { provider: string; step: string; ok: boolean; soft: boolean; detail: string }[] = [];

function summarize(out: unknown): string {
  if (Array.isArray(out)) return `(${out.length} items)`;
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    if ("authorizationUrl" in o) return `ref=${o.reference}`;
    if ("transactions" in o) return `(${(o.transactions as unknown[]).length} txns)`;
    if ("accountName" in o) return `name=${o.accountName}`;
    if ("status" in o) {
      return `status=${o.status}${o.amount !== undefined ? ` amount=${o.amount}` : ""}`;
    }
  }
  return "";
}

async function runSteps(label: string, steps: Step[]): Promise<void> {
  for (const s of steps) {
    try {
      const out = await s.run();
      results.push({ provider: label, step: s.name, ok: true, soft: !!s.soft, detail: summarize(out) });
      console.log(`  PASS  ${s.name.padEnd(18)} ${summarize(out)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ provider: label, step: s.name, ok: false, soft: !!s.soft, detail: msg });
      console.log(`  ${s.soft ? "WARN" : "FAIL"}  ${s.name.padEnd(18)} ${msg}`);
    }
  }
}

async function checkProvider(provider: ProviderName, cfg: PayClientConfig): Promise<void> {
  console.log(`\n=== ${provider.toUpperCase()} ===`);
  const pay = createPayClient(cfg);
  const email = "integration@pay-kit.dev";
  let reference = "";

  const acct = process.env.RESOLVE_ACCOUNT;
  const bank = process.env.RESOLVE_BANK;

  const steps: Step[] = [
    { name: "listBanks", run: () => pay.listBanks({ country: "NG" }) },
    { name: "getBalances", run: () => pay.getBalances() },
    { name: "listTransactions", run: () => pay.listTransactions({ perPage: 5, page: 1 }) },
    {
      name: "initialize",
      run: async () => {
        const r = await pay.initialize({
          amount: 500000,
          email,
          reference: `pk_it_${provider}_${Date.now()}`,
        });
        reference = r.reference;
        return r;
      },
    },
    // Unpaid, so a pending/abandoned status is expected - soft.
    { name: "verify", soft: true, run: () => pay.verify(reference) },
  ];

  if (acct && bank) {
    steps.push({
      name: "resolveAccount",
      soft: true,
      run: () => pay.resolveAccount({ accountNumber: acct, bankCode: bank }),
    });
    if (process.env.RUN_TRANSFERS === "1") {
      steps.push({
        name: "transfer(test)",
        soft: true,
        run: () =>
          pay.transfer({
            amount: 1000,
            recipient: { accountNumber: acct, bankCode: bank },
            reason: "pay-kit integration test",
          }),
      });
    }
  }

  await runSteps(provider, steps);
}

const paystackKey = process.env.PAYSTACK_SECRET_KEY;
const flwKey = process.env.FLUTTERWAVE_SECRET_KEY;
const flwHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;

if (!paystackKey && !flwKey) {
  console.log(
    "No test keys found.\nCopy .env.example to .env, add your Paystack/Flutterwave TEST secret keys, then re-run `bun run integration`.",
  );
  process.exit(0);
}

if (paystackKey) await checkProvider("paystack", { provider: "paystack", secretKey: paystackKey });
if (flwKey) {
  await checkProvider("flutterwave", {
    provider: "flutterwave",
    secretKey: flwKey,
    webhookSecret: flwHash,
  });
}

const passed = results.filter((r) => r.ok).length;
const softFailed = results.filter((r) => !r.ok && r.soft).length;
const hardFailed = results.filter((r) => !r.ok && !r.soft);

console.log(`\n${passed} passed, ${softFailed} soft-failed, ${hardFailed.length} failed`);
if (hardFailed.length) {
  console.log("Failed steps (likely path/field mismatches to fix):");
  for (const f of hardFailed) console.log(`  - ${f.provider} ${f.step}: ${f.detail}`);
}
process.exit(hardFailed.length > 0 ? 1 : 0);
