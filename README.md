# pay-kit

> One typed SDK for African payment rails. Unified **Paystack** and **Flutterwave**: initialize a payment, verify it, and handle signature-verified webhooks - with the same API for both.

[![CI](https://github.com/siyegs/pay-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/siyegs/pay-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/badge/npm-%40siyegs%2Fpay--kit-cb3837)](https://www.npmjs.com/package/@siyegs/pay-kit)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![types](https://img.shields.io/badge/types-included-3178c6)](./src/types.ts)

Most serious African products integrate **both** Paystack and Flutterwave - for coverage, redundancy, and better rates. But their APIs, webhook signatures, error shapes, and currency units all differ, so teams re-write the same fragile glue every time. `pay-kit` gives you **one typed interface** over both.

## Why

- **One API, two providers.** Swap `provider: "paystack"` for `"flutterwave"` - your code doesn't change.
- **Subunits everywhere.** Amounts are always in the smallest unit (kobo/cents), Stripe-style, to kill float-rounding bugs. pay-kit converts per provider.
- **Signature-verified webhooks.** Paystack HMAC-SHA512 and Flutterwave `verif-hash`, both normalized to the same event shape.
- **Typed end to end.** Full TypeScript types, one `PayKitError` with a machine-readable `code`.
- **Tiny + dependency-free.** Uses native `fetch` and `node:crypto`. ESM + CJS.

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
});
// -> { status: "success" | "failed" | "pending", amount, authorization, ... }
```

Tokens are provider-specific, so on a fallback client `chargeAuthorization(provider, params)` charges via the provider that issued the token.

### Balances & reconciliation

Check your float before paying out, and pull transaction history to reconcile against your own records - both normalized to subunits across providers.

```ts
const balances = await pay.getBalances();
// [{ currency: "NGN", available: 1500000, raw }]  (available is in kobo/cents)

const { transactions } = await pay.listTransactions({ page: 1, perPage: 50 });
// [{ reference, status, amount, currency, paidAt?, customer?, raw }, ...]
```

On a fallback client both take the provider explicitly: `getBalances(provider)` and `listTransactions(provider, options?)`.

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

### Methods

- `initialize(params) -> { reference, authorizationUrl, accessCode?, raw }`
- `verify(reference) -> { reference, status, amount, currency, paidAt?, channel?, customer?, authorization?, raw }` - `authorization` is a reusable token for `chargeAuthorization`
- `chargeAuthorization(params) -> VerifyResult` - charge a returning customer with a saved token, no redirect
- `refund(reference, options?) -> { reference, status, amount?, raw }` - full refund, or partial with `options.amount` (subunits)
- `transfer(params) -> { reference, status, amount?, transferId?, recipientCode?, raw }` - send a payout to a bank account
- `verifyTransfer(transferId) -> { reference, status, amount?, transferId?, raw }` - check a payout's final state (payouts settle asynchronously)
- `resolveAccount({ accountNumber, bankCode }) -> { accountNumber, accountName, bankCode?, raw }` - confirm an account holder's name before paying out
- `listBanks(options?) -> { name, code }[]` - supported banks for a payout bank picker (`options.country`, ISO-2, defaults NG)
- `getBalances() -> { currency, available, raw }[]` - your provider wallet balance(s) in subunits, one per currency
- `listTransactions(options?) -> { transactions, page?, raw }` - paginated transaction history for reconciliation (`options.page`, `options.perPage`)
- `webhooks.construct(rawBody, signature) -> { type, reference, status?, amount?, currency?, raw }`

`status` is normalized to `"success" | "failed" | "pending" | "abandoned"`. Errors are thrown as `PayKitError` with `code` in `provider_error | network_error | invalid_signature | config_error | verification_failed`.

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
- [ ] Plans & subscriptions
- [ ] Framework adapters (NestJS, Hono, Next.js route handlers)

## Development

Built with the [Bun](https://bun.sh) toolchain.

```bash
bun install          # install deps
bun test             # run the test suite (bun:test)
bun run typecheck    # tsc --noEmit
bun run build        # tsup -> dist (ESM + CJS + .d.ts)
```

## License

MIT (c) Iyegere Success Karboloo
