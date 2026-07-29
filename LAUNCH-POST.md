---
title: I built pay-kit, an SDK that unifies Paystack and Flutterwave
published: false
tags: typescript, opensource, payments, node
---

If you have shipped a serious product in Nigeria (or most of Africa), you have probably integrated **both** Paystack and Flutterwave. You do it for coverage, for redundancy when one provider has a bad day, and sometimes for better rates on a given card or channel.

And every single time, you rewrite the same fragile glue: two different request shapes, two different webhook signature schemes, two different ideas of what an "amount" is, two different error formats. I got tired of copying that layer between projects, so I built it once, properly, and open-sourced it.

It is called **pay-kit**: one typed TypeScript SDK over Paystack and Flutterwave. Swap the provider, and your code does not change.

```bash
npm install @siyegs/pay-kit
```

## The core idea: one API, two providers

```ts
import { createPayClient } from "@siyegs/pay-kit";

const pay = createPayClient({
  provider: "paystack", // or "flutterwave" - nothing else changes
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
});

// Amounts are always in subunits (kobo/cents), Stripe-style, to kill float bugs.
const { authorizationUrl, reference } = await pay.initialize({
  amount: 500000, // NGN 5,000.00
  email: "customer@example.com",
  callbackUrl: "https://your-app.com/pay/callback",
});

// after the customer pays:
const result = await pay.verify(reference);
if (result.status === "success") {
  // fulfill the order
}
```

The whole surface is normalized: `initialize`, `verify`, `refund`, `transfer`, `resolveAccount`, `listBanks`, `getBalances`, `listTransactions`, and signature-verified webhooks - the same shape whether you are on Paystack or Flutterwave.

## The parts I am most happy with

**Automatic provider fallback.** If Paystack is having an outage, fall through to Flutterwave without touching your code:

```ts
import { createFallbackClient } from "@siyegs/pay-kit";

const pay = createFallbackClient({
  providers: [
    { provider: "paystack", secretKey: process.env.PAYSTACK_SECRET_KEY! },
    { provider: "flutterwave", secretKey: process.env.FLW_SECRET_KEY!, webhookSecret: process.env.FLW_HASH },
  ],
});

const { reference, provider } = await pay.initialize({ amount: 500000, email: "a@b.com", callbackUrl: "..." });
// only outage-like failures (network / 5xx / 429) trigger fallback; a 4xx fails fast
```

**A keyless mock provider.** Test your entire payment flow with no API keys and no network - great for CI and local dev:

```ts
const pay = createPayClient({ provider: "mock" });
const { reference } = await pay.initialize({ amount: 500000, email: "a@b.com" });
await pay.verify(reference); // { status: "success", amount: 500000, ... }
```

**Payouts, not just collection.** Send money out with the same unified API - `transfer`, `verifyTransfer`, plus `resolveAccount` and `listBanks` to confirm who you are paying before you pay them.

**Marketplace splits.** Route part of a charge to a subaccount - the primitive behind creator payouts and multi-vendor checkouts.

## Being honest about status

pay-kit is **beta (pre-1.0)**. It is fully typed and unit-tested, and the core methods (`initialize`, `verify`, `resolveAccount`, `listBanks`, `getBalances`, `listTransactions`) are verified against the **real** Paystack and Flutterwave test sandboxes - the SDK even ships a `bun run integration` harness that runs it against the live sandboxes, which is how I caught and fixed a real Flutterwave `initialize` bug before this post. A few methods still need a paid transaction or configured subaccounts to fully exercise, and the README says exactly what is and is not verified. Pin a version, test the flows you depend on, and open an issue if anything does not match live behavior.

## Try it

- npm: https://www.npmjs.com/package/@siyegs/pay-kit
- GitHub: https://github.com/siyegs/pay-kit

If you build for African payment rails, I would genuinely love your feedback - and a star helps more people find it. If a call does not match what a provider actually does, open an issue and I will fix it.

Built with TypeScript and the Bun toolchain. More providers and features are on the roadmap.
