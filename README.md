# pay-kit

> One typed TypeScript SDK unifying **Paystack** and **Flutterwave** - charge, verify, refund, pay out, split, and verify webhooks through a single API. Open-source, runs in your own backend, no middleman in your money path.

[![CI](https://github.com/siyegs/pay-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/siyegs/pay-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/badge/npm-%40siyegs%2Fpay--kit-cb3837)](https://www.npmjs.com/package/@siyegs/pay-kit)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![types](https://img.shields.io/badge/types-included-3178c6)](./src/types.ts)
[![status](https://img.shields.io/badge/status-beta-orange)](#status)

> **Status: beta (pre-1.0).** pay-kit is fully typed, unit-tested, and now **verified end to end against the live Paystack and Flutterwave sandboxes** for the core flows - initialize, verify, refund, saved-card charge, subaccount creation, and signature-verified webhooks. Live testing caught and fixed two real bugs. A few methods stay account-gated in test mode (payouts, `verifyTransfer`); the [Status](#status) section says exactly what is and isn't verified. Pin an exact version and test the flows you depend on - the API may still change before 1.0.

Most serious African products integrate **both** Paystack and Flutterwave - for coverage, redundancy, and better rates. But their APIs, webhook signatures, error shapes, and currency units all differ, so teams re-write the same fragile glue every time. `pay-kit` gives you **one typed interface** over both. And unlike a hosted payments gateway, it is a library you own: it runs in your backend and calls the providers directly with your own keys - no third party in your money path, no monthly bill.

## Why

- **One API, two providers.** Swap `provider: "paystack"` for `"flutterwave"` - your code doesn't change.
- **Subunits everywhere.** Amounts are always in the smallest unit (kobo/cents), Stripe-style, to kill float-rounding bugs. pay-kit converts per provider.
- **Signature-verified webhooks.** Paystack HMAC-SHA512 and Flutterwave `verif-hash`, both normalized to the same event shape.
- **Typed end to end.** Full TypeScript types, one `PayKitError` with a machine-readable `code`.
- **No middleman.** A library, not a hosted gateway - it calls Paystack/Flutterwave straight from your backend with your own keys. Nothing routes through a third-party service, so there's no added dependency, latency, monthly fee, or extra point of failure in your payment flow.
- **Tiny + dependency-free.** Uses native `fetch` and `node:crypto`. ESM + CJS.

### Library vs hosted gateway

pay-kit is a library you install, not a payments gateway you route through. If you were weighing the two:

| | **pay-kit** (library) | **Hosted aggregator gateway** |
| --- | --- | --- |
| Where it runs | Your backend | Their servers |
| Money path | You → Paystack/Flutterwave, directly | You → their gateway → provider |
| Keys | Your own provider keys | Often their account / re-KYC |
| Cost | Free (MIT), just provider fees | Provider fees + the gateway's cut / monthly fee |
| Extra failure point | None | Their uptime is now in your path |
| Data | Stays in your stack | Transits a third party |
| Lock-in | It's your code; fork it | Migrating off means re-integrating |

Use a hosted gateway if you want an all-in-one dashboard and don't mind a middleman. Use pay-kit if you want to keep providers direct, keys yours, and the money path short - with the multi-provider ergonomics done for you.

## Install

```bash
bun add @siyegs/pay-kit
# or: npm install @siyegs/pay-kit / pnpm add @siyegs/pay-kit
```

Runs on **Bun** and **Node >= 18** (both provide global `fetch` and `node:crypto`). Keep your secret key **server-side only**.

## Quick start

```ts
import { createPayClient } from "@siyegs/pay-kit";

const pay = createPayClient({
  provider: "paystack", // or "flutterwave"
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
});

// 1. Start a payment (amount in subunits: 500000 = NGN 5,000.00)
const { authorizationUrl, reference } = await pay.initialize({
  amount: 500000,
  email: "customer@example.com",
  currency: "NGN",
  callbackUrl: "https://your-app.com/pay/callback", // required for Flutterwave, optional for Paystack
  metadata: { orderId: "order_123" },
});
// -> redirect the customer to `authorizationUrl`, persist `reference`

// 2. Verify after the redirect / callback
const result = await pay.verify(reference);
if (result.status === "success") {
  // fulfill the order
}
```

## Webhooks

Verify the raw request body against its signature header and get a normalized event. **Always verify before trusting a webhook.**

```ts
// Express example
app.post("/webhooks/pay", express.raw({ type: "*/*" }), (req, res) => {
  const signature =
    req.header("x-paystack-signature") ?? req.header("verif-hash") ?? "";
  try {
    const event = pay.webhooks.construct(req.body.toString("utf8"), signature);
    if (event.type === "charge.success") {
      // event.reference, event.amount (subunits), event.currency
    }
    res.sendStatus(200);
  } catch {
    res.sendStatus(400); // invalid signature -> reject
  }
});
```

- **Paystack**: signature header is `x-paystack-signature`; verification uses your `secretKey`.
- **Flutterwave**: header is `verif-hash`; pass your "Secret hash" as `webhookSecret` when creating the client.

### Typed events

`WebhookEvent` is a discriminated union. The exported type guards narrow it precisely - use them rather than a bare `event.type ===` check, because Paystack forwards its own event names (`refund.processed`, `subscription.create`, ...) through the open catch-all variant:

```ts
import { isChargeSuccess, isTransferFailed } from "@siyegs/pay-kit";

const event = pay.webhooks.construct(rawBody, signature);
if (isChargeSuccess(event)) {
  event.status; // narrowed to "success"
  fulfilOrder(event.reference, event.amount); // amount in subunits
} else if (isTransferFailed(event)) {
  retryPayout(event.reference);
}
```

Guards: `isChargeSuccess`, `isChargeFailed`, `isTransferSuccess`, `isTransferFailed`. The matching event types (`ChargeSuccessEvent`, ...) are exported too. Any other provider event arrives as the open `OtherWebhookEvent` - switch on `event.type` for those.

### Next.js / Web `Request` handler

On any Fetch-API runtime (Next.js App Router, Remix, Hono, SvelteKit, Cloudflare Workers, Deno, Bun), import the helper from `@siyegs/pay-kit/next`. It reads the raw body for you (the usual signature footgun), verifies, dispatches, and returns the right status.

```ts
// app/api/webhooks/pay/route.ts
import { createPayClient } from "@siyegs/pay-kit";
import { webhookRoute } from "@siyegs/pay-kit/next";

const pay = createPayClient({ provider: "paystack", secretKey: process.env.PAYSTACK_SECRET_KEY! });

export const POST = webhookRoute(pay, {
  onEvent: async (event) => {
    if (event.type === "charge.success") {
      // fulfil the order, idempotently keyed on event.reference
    }
  },
});
// 401 bad signature · 400 malformed · 500 if onEvent throws (provider retries) · 200 ok
```

Prefer to verify yourself? `constructWebhookFromRequest(pay, request)` returns the normalized event (or throws `invalid_signature`). See [`examples/webhook-next.ts`](./examples/webhook-next.ts).

### Express / Hono / Fastify

Dedicated adapters for the common Node frameworks - each one reads the **raw** request bytes itself (the signature footgun), verifies, dispatches the normalized event, and replies `401` bad signature / `400` malformed / `500` handler threw (provider retries) / `200` ok. They add **zero dependencies** - the returned middleware/handler/plugin is plain code your framework runs; install the framework alongside.

**Express** - `@siyegs/pay-kit/express`. Mount the middleware on the webhook route - no `express.raw()` needed, and no JSON body parser on this route:

```ts
import { webhookMiddleware } from "@siyegs/pay-kit/express";

app.post("/webhooks/pay", webhookMiddleware(pay, {
  onEvent: async (event) => {
    if (event.type === "charge.success") { /* fulfil the order, idempotently */ }
  },
}));
```

**Hono** - `@siyegs/pay-kit/hono`. Returns a handler you pass as the route handler; it reads Hono's underlying raw request (`c.req.raw`) for you:

```ts
import { webhookHandler } from "@siyegs/pay-kit/hono";

const app = new Hono();
app.post("/webhooks/pay", webhookHandler(pay, { onEvent }));
```

**Fastify** - `@siyegs/pay-kit/fastify`. A plugin that registers a catch-all content-type parser (`parseAs: "string"`) and the route inside one **encapsulated scope**, so your other routes keep Fastify's default body parsing:

```ts
import { webhookPlugin } from "@siyegs/pay-kit/fastify";

const app = Fastify();
app.register(webhookPlugin(pay, { path: "/webhooks/pay", onEvent }));
```

All three also export a `constructWebhookFromRequest`-style helper if you prefer to verify and handle the response yourself. See [`examples/webhook-express.ts`](./examples/webhook-express.ts), [`examples/webhook-hono.ts`](./examples/webhook-hono.ts), and [`examples/webhook-fastify.ts`](./examples/webhook-fastify.ts).

## Provider fallback

Try one provider, automatically fall through to the next when it is unreachable - so a Paystack outage doesn't stop you taking money.

```ts
import { createFallbackClient } from "@siyegs/pay-kit";

const pay = createFallbackClient({
  providers: [
    { provider: "paystack", secretKey: process.env.PAYSTACK_SECRET_KEY! },
    { provider: "flutterwave", secretKey: process.env.FLW_SECRET_KEY!, webhookSecret: process.env.FLW_HASH },
  ],
});

// initialize tries Paystack, then Flutterwave on an outage
const { reference, provider } = await pay.initialize({ amount: 500000, email: "a@b.com" });

// persist BOTH reference and provider, then route the rest to that provider
const result = await pay.verify(provider, reference);
await pay.refund(provider, reference);
const event = pay.webhooks.construct(provider, rawBody, signature);
```

- Only **outage-like** failures trigger fallback: network errors, HTTP 5xx, and 429. A 4xx (bad request, invalid key) fails fast - it would fail the same way on the next provider.
- A charge started on one provider can only be verified/refunded on that provider, so `initialize` returns which `provider` handled it. **Persist `provider` alongside `reference`.**
- Fallback is safest for *pre-charge* outages (provider unreachable). If a provider accepts the charge then the connection drops, retrying the other provider could double-charge - use idempotency at your order layer for that edge.

### Marketplace splits

Route part of a charge to a connected subaccount - the core primitive for marketplaces and creator payouts. Create the subaccount on your provider first, then reference it at charge time:

```ts
await pay.initialize({
  amount: 500000,
  email: "buyer@example.com",
  split: {
    subaccount: "ACCT_vendor123", // Paystack subaccount code / Flutterwave subaccount id
    transactionCharge: 50000,      // optional flat platform fee, in subunits
    bearer: "subaccount",          // who pays provider fees (Paystack)
  },
});
```

pay-kit maps this to Paystack's `subaccount`/`transaction_charge`/`bearer` and Flutterwave's `subaccounts` array, converting fees to each provider's unit.

Create the subaccount programmatically instead of in the dashboard:

```ts
const sub = await pay.createSubaccount({
  businessName: "Vendor A",
  bankCode: "058",          // from listBanks()
  accountNumber: "0001112223",
  percentageCharge: 20,     // 0-100; the share that settles to this subaccount
  email: "vendor@example.com", // required for Flutterwave
});

// use sub.id at charge time:
await pay.initialize({ amount: 500000, email: "buyer@example.com", split: { subaccount: sub.id } });
```

`sub.id` is Paystack's `subaccount_code` / Flutterwave's `subaccount_id`. `percentageCharge` maps to Paystack's `percentage_charge` and Flutterwave's `percentage` split (its 0-1 `split_value`).

### Returning customers (saved-card charge)

After a first successful charge, `verify` hands you a reusable **`authorization`** token. Persist it against the customer and charge them again later with **no redirect** - the primitive behind subscriptions and one-tap repeat purchases.

```ts
const first = await pay.verify(reference);
const token = first.authorization; // Paystack authorization_code / Flutterwave card token - store it

// next billing cycle, or a repeat purchase:
const charge = await pay.chargeAuthorization({
  authorizationCode: token!,
  email: "customer@example.com",
  amount: 500000,
  callbackUrl: "https://your-app.com/pay/callback", // required for Flutterwave, ignored by Paystack
});
// -> { status: "success" | "failed" | "pending", amount, authorization, ... }
```

> Use the same `email` the original charge recorded (`verify().customer.email`) - Flutterwave ties the saved token to that email and rejects a mismatch.

Tokens are provider-specific, so on a fallback client `chargeAuthorization(provider, params)` charges via the provider that issued the token.

### Plans & subscriptions

Recurring billing with one API across both providers - create plans, start subscriptions, and manage them without touching provider dashboards.

```ts
// 1. Define the plan (amount in subunits; `interval` is monthly/weekly/
//    yearly/biannually/quarterly or any provider interval string)
const plan = await pay.createPlan({
  name: "Pro Monthly",
  amount: 500000, // kobo/cents
  interval: "monthly",
  currency: "NGN",
});
// -> { id, name, amount, interval, currency?, status?, duration?, raw }
```

Then start the subscription the way each provider wants it:

```ts
// Paystack: create the subscription directly (needs a customer with an
// existing authorization - e.g. from a first saved-card charge)
const sub = await pay.createSubscription({
  customer: "CUS_xxxx",            // customer code, or email
  plan: plan.id,                   // the plan code
  authorization: "auth_xxxx",      // optional: specific card to charge
});
// -> { id: "SUB_xxx", status: "active", emailToken, ... }
//    store emailToken - cancel/enable need it

// Flutterwave: no create-subscription endpoint - start it with a charge:
const checkout = await pay.initialize({
  amount: 500000, email: "a@b.com",
  plan: "123",                     // numeric payment plan id from createPlan
});
```

Manage them:

```ts
await pay.listPlans({ page: 1, perPage: 50 });         // -> { plans, page?, raw }
await pay.fetchPlan(plan.id);
await pay.updatePlan(plan.id, { name: "Pro+", amount: 600000 });
await pay.cancelPlan(plan.id);                          // Paystack: throws code "unsupported"
                                                        //   (no cancel endpoint - update instead)

await pay.listSubscriptions({ perPage: 50 });           // -> { subscriptions, page?, raw }
await pay.fetchSubscription(sub.id);
await pay.cancelSubscription(sub.id, { token: sub.emailToken! }); // Paystack needs the token
await pay.enableSubscription(sub.id, { token: sub.emailToken! }); // re-activate after cancel
```

Provider quirks pay-kit normalizes: Paystack has no cancel-plan endpoint (`cancelPlan` throws code `"unsupported"`) and expects plan `amount` up front; Flutterwave allows amount-less dynamic plans, keys plans by a **numeric** id (a non-numeric `plan` throws `config_error`), and exposes cancel/re-activate with no token. On a fallback client plans/subscriptions always target one provider explicitly, like transfers.

### Balances & reconciliation

Check your float before paying out, and pull transaction history to reconcile against your own records - both normalized to subunits across providers.

```ts
const balances = await pay.getBalances();
// [{ currency: "NGN", available: 1500000, raw }]  (available is in kobo/cents)

const { transactions } = await pay.listTransactions({ page: 1, perPage: 50 });
// [{ reference, status, amount, currency, paidAt?, customer?, raw }, ...]
```

On a fallback client both take the provider explicitly: `getBalances(provider)` and `listTransactions(provider, options?)`.

## NestJS

Register a configured `PayClient` in the DI container with `@siyegs/pay-kit/nestjs` and inject it anywhere. (`@nestjs/common` is an optional peer dependency - only needed if you use this import.)

```ts
// app.module.ts
import { PayKitModule } from "@siyegs/pay-kit/nestjs";

@Module({
  imports: [
    PayKitModule.forRoot({
      provider: "paystack",
      secretKey: process.env.PAYSTACK_SECRET_KEY!,
      isGlobal: true, // inject it anywhere without re-importing the module
    }),
  ],
})
export class AppModule {}
```

```ts
// payments.service.ts
import { InjectPayClient } from "@siyegs/pay-kit/nestjs";
import type { PayClient } from "@siyegs/pay-kit";

@Injectable()
export class PaymentsService {
  constructor(@InjectPayClient() private readonly pay: PayClient) {}
  checkout() {
    return this.pay.initialize({ amount: 500000, email: "a@b.com" });
  }
}
```

Reading config from `ConfigService`? Use `PayKitModule.forRootAsync({ inject: [ConfigService], useFactory: (c) => ({ provider: "paystack", secretKey: c.getOrThrow("PAYSTACK_SECRET_KEY") }) })`. See [`examples/nestjs.ts`](./examples/nestjs.ts).

## Testing with the mock provider

Use `provider: "mock"` to exercise a full payment flow with **no API keys and no network** - ideal for local development, CI, and unit tests. It implements the same interface as the real providers, so your code stays identical; only the config changes.

```ts
const pay = createPayClient({ provider: "mock" }); // no secretKey needed

const { reference } = await pay.initialize({ amount: 500000, email: "a@b.com" });
const result = await pay.verify(reference); // { status: "success", amount: 500000, ... }
await pay.transfer({ amount: 10000, recipient: { accountNumber: "0001234567", bankCode: "001" } });
```

The mock is **stateful per client**: a charge you `initialize` is remembered, so a later `verify` echoes the same amount and customer. An unknown reference verifies as `"abandoned"`, and each `createPayClient({ provider: "mock" })` gets its own isolated store. Swap `provider` back to `"paystack"` or `"flutterwave"` for production - nothing else changes.

## API

### `createPayClient(config)`

| option             | type                          | notes                                              |
| ------------------ | ----------------------------- | -------------------------------------------------- |
| `provider`         | `"paystack" \| "flutterwave" \| "mock"` | required                                 |
| `secretKey`        | `string`                      | required for real providers, server-side only      |
| `webhookSecret`    | `string`                      | required for Flutterwave webhooks (Secret hash)    |
| `baseUrl`          | `string`                      | override API base (tests/proxies)                  |
| `fetch`            | `typeof fetch`                | inject a fetch impl                                |
| `generateReference`| `() => string`                | customize reference generation                     |
| `timeout`          | `number`                      | per-request timeout in ms (default `30000`; `0` disables) |

### Methods

- `initialize(params) -> { reference, authorizationUrl, accessCode?, raw }`
- `verify(reference) -> { reference, status, amount, currency, paidAt?, channel?, customer?, authorization?, raw }` - `authorization` is a reusable token for `chargeAuthorization`
- `chargeAuthorization(params) -> VerifyResult` - charge a returning customer with a saved token (Flutterwave requires `callbackUrl`; Paystack needs no redirect)
- `refund(reference, options?) -> { reference, status, amount?, raw }` - full refund, or partial with `options.amount` (subunits)
- `transfer(params) -> { reference, status, amount?, transferId?, recipientCode?, raw }` - send a payout to a bank account
- `verifyTransfer(transferId) -> { reference, status, amount?, transferId?, raw }` - check a payout's final state (payouts settle asynchronously)
- `resolveAccount({ accountNumber, bankCode }) -> { accountNumber, accountName, bankCode?, raw }` - confirm an account holder's name before paying out
- `listBanks(options?) -> { name, code }[]` - supported banks for a payout bank picker (`options.country`, ISO-2, defaults NG)
- `getBalances() -> { currency, available, raw }[]` - your provider wallet balance(s) in subunits, one per currency
- `listTransactions(options?) -> { transactions, page?, raw }` - paginated transaction history for reconciliation (`options.page`, `options.perPage`)
- `createSubaccount({ businessName, bankCode, accountNumber, percentageCharge, email? }) -> { id, businessName?, accountNumber?, bankCode?, raw }` - create a connected subaccount for splits (Flutterwave requires `email`); pass `id` as `SplitConfig.subaccount`
- `createPlan({ name, amount?, interval, currency?, duration? }) -> { id, name, amount?, interval, currency?, status?, duration?, raw }` - define a recurring plan (Paystack requires `amount`; Flutterwave allows dynamic amounts)
- `listPlans(options?) -> { plans, page?, raw }` - paginated plans (`options.page`, `options.perPage`, `options.status`)
- `fetchPlan(idOrCode) -> Plan` - plan by code/id
- `updatePlan(idOrCode, { name?, amount?, interval?, ... }) -> Plan` - change name, price, or schedule
- `cancelPlan(idOrCode) -> Plan` - deactivate a plan (Flutterwave); **Paystack throws code `"unsupported"`** - no cancel endpoint exists
- `createSubscription({ customer, plan, authorization?, startDate?, endDate? }) -> { id, status, emailToken?, ... }` - start a subscription (Paystack; Flutterwave starts them via `initialize({ plan })`)
- `listSubscriptions(options?) -> { subscriptions, page?, raw }` - paginated subscriptions
- `fetchSubscription(idOrCode) -> Subscription`
- `cancelSubscription(idOrCode, { token? }) -> Subscription` - stop recurring charges (Paystack requires the `emailToken` from `createSubscription`; Flutterwave needs no token)
- `enableSubscription(idOrCode, { token? }) -> Subscription` - re-activate a cancelled subscription (token rules as above)
- `webhooks.construct(rawBody, signature) -> { type, reference, status?, amount?, currency?, raw }`

`status` is normalized to `"success" | "failed" | "pending" | "abandoned"`.

Every request is bounded by a timeout (default 30s) so a hung provider connection can't block your handler forever; on a fallback client a `timeout` counts as an outage and moves on to the next provider.

### Error handling

Every failure is thrown as a single `PayKitError` with a machine-readable `code`, so you can branch without string-matching messages:

```ts
import { PayKitError } from "@siyegs/pay-kit";

try {
  await pay.initialize({ amount: 500000, email: "a@b.com" });
} catch (err) {
  if (err instanceof PayKitError) {
    err.code;       // one of the codes below
    err.provider;   // "paystack" | "flutterwave" | ... (when provider-specific)
    err.statusCode; // upstream HTTP status, when there was one
    err.raw;        // the raw provider payload, for logging
  }
}
```

| `code` | When |
| --- | --- |
| `provider_error` | The provider rejected the request (4xx/5xx, or an app-level `status:false`). `statusCode` and `raw` are set. |
| `network_error` | The request never completed (DNS, connection reset, offline). Retryable. |
| `timeout` | The request exceeded the configured `timeout`. Retryable - a fallback client moves to the next provider. |
| `invalid_signature` | A webhook signature did not match. Reject the webhook. |
| `config_error` | Missing/invalid config (e.g. no `secretKey`, or a Flutterwave call without `callbackUrl`/`webhookSecret`). |
| `verification_failed` | A payment could not be verified as successful. |

`isRetryableError(err)` returns `true` for `network_error`, `timeout`, and outage-like HTTP statuses (5xx/429) - the same rule the fallback client uses.

### Transfers / payouts

Send money out to a bank account with one API across both providers. pay-kit handles the provider differences - Paystack needs a transfer recipient created first, Flutterwave takes the account inline - so you don't have to.

```ts
const payout = await pay.transfer({
  amount: 500000, // subunits (kobo/cents)
  reason: "Creator payout - July",
  recipient: {
    accountNumber: "0001234567",
    bankCode: "058", // provider bank code
    name: "Ada Lovelace",
  },
});
// { reference, status: "pending" | "success" | "failed", transferId?, ... }
```

On a fallback client, `transfer(provider, params)` takes the provider **explicitly** and never falls through - re-sending a payout after a timeout could pay the recipient twice, so you name the rail and reconcile by `reference`.

Payouts settle **asynchronously**, so `transfer` usually returns `pending`. Persist the `transferId` and confirm the final state later:

```ts
const payout = await pay.transfer({ amount: 500000, recipient: { accountNumber: "0001234567", bankCode: "058" } });
// later (or from a transfer.success/failed webhook):
const final = await pay.verifyTransfer(payout.transferId!); // { status: "success" | "failed" | "pending", ... }
```

### Bank list & account resolution

Populate a bank picker and confirm the account holder's name before you send money - the classic "is this really who I think it is?" step.

```ts
const banks = await pay.listBanks({ country: "NG" });
// [{ name: "Access Bank", code: "044" }, { name: "GTBank", code: "058" }, ...]

const account = await pay.resolveAccount({ accountNumber: "0001234567", bankCode: "058" });
// { accountName: "ADA LOVELACE", accountNumber: "0001234567", ... } -> show, confirm, then transfer
```

Bank codes are **provider-specific**, so list and resolve against the same provider you transfer with. On a fallback client both take the provider explicitly: `listBanks(provider, options?)`, `resolveAccount(provider, params)`.

## Roadmap

- [x] Refunds (full & partial)
- [x] **Provider fallback** (auto-retry the other provider on outage)
- [x] Transfers / payouts
- [x] Bank list & account resolution
- [x] Mock provider for offline development & tests
- [x] Balances & transaction history (reconciliation)
- [x] Saved-card / tokenized recurring charge
- [x] Marketplace splits (charge to subaccount)
- [x] Typed webhook events (discriminated union + type guards)
- [x] Web / Next.js webhook route adapter (`@siyegs/pay-kit/next`, works in any Fetch-API runtime)
- [x] NestJS module adapter (`@siyegs/pay-kit/nestjs`)
- [x] Express / Hono / Fastify webhook adapters (`@siyegs/pay-kit/express`, `/hono`, `/fastify`)
- [x] Plans & subscriptions (recurring billing)

## Status

pay-kit is **beta (pre-1.0)**. Here is exactly what is and is not verified:

- **Unit-tested:** TypeScript types compile, the package builds (ESM + CJS + `.d.ts`), and a full unit-test suite passes (mocked `fetch`), including the Next/NestJS/Express/Hono/Fastify webhook adapters. The mock provider is exercised directly.
- **Live-sandbox verified (both providers):** `initialize`, `verify`, `resolveAccount`, `listBanks`, `getBalances`, `listTransactions`, `refund`, `chargeAuthorization`, and signature-verified webhooks have all been run successfully against the real Paystack and Flutterwave test sandboxes. Two bugs were caught and fixed this way: `initialize` and `chargeAuthorization` both require a redirect URL on Flutterwave (`callbackUrl`), which the SDK previously omitted. Webhook checks confirm a valid signature is accepted, a tampered one is rejected, and the amount is normalized to subunits on both providers - and both are additionally verified against an **actual live delivery** captured from the dashboard (via `scripts/webhook-live.ts`). Real-delivery testing caught a third bug: Flutterwave ships a flat legacy webhook payload the parser didn't handle, now fixed.
- **Live-sandbox verified (Flutterwave):** `createSubaccount` creates a real subaccount, and a charge carrying that subaccount as a `split` is accepted by the live API - so the subaccount + split mapping is verified end to end on Flutterwave. On Paystack both are request-correct but account-gated (see below).
- **Request-validated but account-gated:** `transfer`, `verifyTransfer`, and Paystack `createSubaccount` reach the provider and pass request validation (and Flutterwave IP whitelisting), but completing them requires a transfer-enabled merchant account and a resolvable settlement account - the test account does not have one, so Paystack rejects with "Account details are invalid" / "cannot resolve account". Paystack `splits` is unit-tested only (it needs a created subaccount to attach).
- **Unit-tested, sandbox pending:** `createPlan`/`listPlans`/`fetchPlan`/`updatePlan`/`cancelPlan` and the subscription methods are covered by the mocked-fetch suite; the integration harness lists plans/subscriptions (soft steps), and a live run confirmed `listPlans`/`listSubscriptions` on both sandboxes, but the create/update/cancel paths have not been exercised live yet. Report any mismatch via [issues](https://github.com/siyegs/pay-kit/issues).

Run the read/charge checks yourself with real test keys: `bun run integration`, and the paid-charge checks with `bun run scripts/verify-charge.ts init <provider>` then `... confirm <provider>` after paying the test charge (see [Development](#development)). Please report any mismatch via [issues](https://github.com/siyegs/pay-kit/issues).

## Development

Built with the [Bun](https://bun.sh) toolchain.

```bash
bun install          # install deps
bun test             # run the test suite (bun:test, mocked fetch)
bun run typecheck    # tsc --noEmit
bun run build        # tsup -> dist (ESM + CJS + .d.ts)
```

Runnable examples live in [`examples/`](./examples) (e.g. `bun run examples/checkout.ts`).

### Live-sandbox integration checks

To validate against the **real** Paystack / Flutterwave test sandboxes (not mocks):

```bash
cp .env.example .env   # then add your TEST secret keys
bun run integration
```

`bun run integration` reads keys from `.env` (gitignored - never commit them) and runs `listBanks`, `getBalances`, `listTransactions`, a test-mode `initialize`, and `verify` against each configured provider, printing PASS / WARN / FAIL per step. It only reads and creates a single test-mode charge by default; set `RESOLVE_ACCOUNT` + `RESOLVE_BANK` (and `RUN_TRANSFERS=1`) to also exercise account resolution and a test payout. With no keys present it skips cleanly.

### Releasing

Publishing is automated: cut a **GitHub Release** whose tag matches `package.json`'s
version (e.g. `v0.9.0`) and the [publish workflow](./.github/workflows/publish.yml)
builds, verifies, and publishes to npm via Trusted Publishing (OIDC) with
provenance - no `npm login` required. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Contributing

Issues and PRs welcome - see [CONTRIBUTING.md](./CONTRIBUTING.md),
[CHANGELOG.md](./CHANGELOG.md), and [SECURITY.md](./SECURITY.md). Never paste live
secret keys.

## License

MIT (c) Iyegere Success Karboloo
