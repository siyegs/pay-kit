/**
 * Verify a REAL webhook delivery (captured at webhook.site) against the SDK.
 *
 * Unlike the deterministic `verify-charge.ts webhook` check (which signs its own
 * payload), this proves pay-kit accepts an ACTUAL push from the provider.
 *
 *   1. Copy your webhook.site URL and set it as the (test-mode) webhook URL in
 *      the Paystack / Flutterwave / ZevPay dashboard.
 *        - Flutterwave also needs a "Secret hash" set to FLUTTERWAVE_WEBHOOK_HASH.
 *        - ZevPay signs with the webhook secret on the key pair
 *          (ZEVPAY_WEBHOOK_SECRET).
 *   2. Trigger an event: complete a test charge (bun run scripts/verify-charge.ts
 *      init <provider> then pay it), or use the dashboard's "send test webhook".
 *   3. bun run scripts/webhook-live.ts <paystack|flutterwave|zevpay> <webhook-site-token-id>
 *
 * It pulls the latest matching request from the webhook.site API - exact raw
 * bytes, so the signature stays valid - then runs pay.webhooks.construct() on it.
 */
import { createPayClient } from "../src";
import type { ProviderName } from "../src";

const SIGNATURE_HEADER: Partial<Record<ProviderName, string>> = {
  paystack: "x-paystack-signature",
  flutterwave: "verif-hash",
  zevpay: "x-zevpay-signature",
};

const SECRET_KEY_ENV: Partial<Record<ProviderName, string>> = {
  paystack: "PAYSTACK_SECRET_KEY",
  flutterwave: "FLUTTERWAVE_SECRET_KEY",
  zevpay: "ZEVPAY_SECRET_KEY",
};

const WEBHOOK_SECRET_ENV: Partial<Record<ProviderName, string>> = {
  flutterwave: "FLUTTERWAVE_WEBHOOK_HASH",
  zevpay: "ZEVPAY_WEBHOOK_SECRET",
};

const [provider, token] = process.argv.slice(2) as [ProviderName, string];
const sigHeader = provider ? SIGNATURE_HEADER[provider] : undefined;
if (!sigHeader || !token) {
  console.log(
    "Usage: bun run scripts/webhook-live.ts <paystack|flutterwave|zevpay> <webhook-site-token-id>",
  );
  process.exit(1);
}

const res = await fetch(`https://webhook.site/token/${token}/requests?sorting=newest`);
if (!res.ok) {
  console.error(`webhook.site API error: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const payload = (await res.json()) as { data?: WebhookSiteRequest[] };
const requests = payload.data ?? [];
const hit = requests.find((r) => r.method === "POST" && headerOf(r, sigHeader));

if (!hit) {
  console.error(
    `No POST request carrying a "${sigHeader}" header found yet.\n` +
      `Set the webhook.site URL in the ${provider} dashboard, trigger an event, then re-run.`,
  );
  process.exit(1);
}

const raw = hit.content;
const signature = headerOf(hit, sigHeader)!;

const webhookSecretEnv = WEBHOOK_SECRET_ENV[provider];
const pay = createPayClient({
  provider,
  secretKey: process.env[SECRET_KEY_ENV[provider]!]!,
  webhookSecret: webhookSecretEnv ? process.env[webhookSecretEnv] : undefined,
});

try {
  const event = pay.webhooks.construct(raw, signature);
  console.log(`\nPASS - live ${provider} webhook verified and normalized:`);
  console.log(
    `  type=${event.type} reference=${event.reference} amount=${event.amount} currency=${event.currency}`,
  );
  console.log(`  (verified an actual provider delivery, not a self-signed payload)`);
} catch (err) {
  console.error(`\nFAIL - ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

interface WebhookSiteRequest {
  method: string;
  content: string;
  headers: Record<string, string[] | string>;
}

function headerOf(r: WebhookSiteRequest, name: string): string | undefined {
  const v = r.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
}
