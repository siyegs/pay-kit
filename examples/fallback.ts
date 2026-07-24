/**
 * Provider fallback - try one provider, fall through to the next on an outage.
 * Illustrative: needs real keys for both providers (fallback is only meaningful
 * across two live providers). Only outage-like failures (network / 5xx / 429)
 * trigger fallback - a 4xx fails fast.
 */
import { createFallbackClient } from "../src";

const pay = createFallbackClient({
  providers: [
    { provider: "paystack", secretKey: process.env.PAYSTACK_SECRET_KEY! },
    { provider: "flutterwave", secretKey: process.env.FLW_SECRET_KEY!, webhookSecret: process.env.FLW_HASH },
  ],
});

// initialize returns which provider actually handled the charge - persist it
// alongside the reference, then route verify/refund/webhooks back to it.
const res = await pay.initialize({
  amount: 500000,
  email: "customer@example.com",
  callbackUrl: "https://your-app.com/pay/callback",
});

console.log("Handled by:", res.provider);
console.log("Reference:", res.reference);

// later, route follow-ups to the same provider:
const verified = await pay.verify(res.provider, res.reference);
console.log("Status:", verified.status);
