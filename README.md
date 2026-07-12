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

## API

### `createPayClient(config)`

| option             | type                          | notes                                              |
| ------------------ | ----------------------------- | -------------------------------------------------- |
| `provider`         | `"paystack" \| "flutterwave"` | required                                           |
| `secretKey`        | `string`                      | required, server-side only                         |
| `webhookSecret`    | `string`                      | required for Flutterwave webhooks (Secret hash)    |
| `baseUrl`          | `string`                      | override API base (tests/proxies)                  |
| `fetch`            | `typeof fetch`                | inject a fetch impl                                |
| `generateReference`| `() => string`                | customize reference generation                     |

### Methods

- `initialize(params) -> { reference, authorizationUrl, accessCode?, raw }`
- `verify(reference) -> { reference, status, amount, currency, paidAt?, channel?, customer?, raw }`
- `refund(reference, options?) -> { reference, status, amount?, raw }` - full refund, or partial with `options.amount` (subunits)
- `webhooks.construct(rawBody, signature) -> { type, reference, status?, amount?, currency?, raw }`

`status` is normalized to `"success" | "failed" | "pending" | "abandoned"`. Errors are thrown as `PayKitError` with `code` in `provider_error | network_error | invalid_signature | config_error | verification_failed`.

## Roadmap

- [x] Refunds (full & partial)
- [x] **Provider fallback** (auto-retry the other provider on outage)
- [ ] Transfers / payouts
- [ ] Plans & subscriptions
- [ ] Framework adapters (NestJS, Hono, Next.js route handlers)
- [ ] Mock provider for offline development

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
