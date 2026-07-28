# Examples

Runnable snippets for pay-kit.

- **`checkout.ts`** - a full initialize -> verify -> refund flow using the keyless
  `mock` provider, so it runs with **no API keys**:

  ```bash
  bun run examples/checkout.ts
  ```

- **`fallback.ts`** - using `createFallbackClient` to fall through to a second
  provider on an outage (illustrative; needs real keys for both providers).

- **`webhook-express.ts`** - verifying a webhook signature in an Express handler
  (illustrative; needs `express` and a real secret key).

- **`webhook-next.ts`** - a Next.js App Router webhook route using the
  `@siyegs/pay-kit/next` adapter (also works in Remix, Hono, Workers, Deno, Bun).

- **`webhook-hono.ts`** - the same `@siyegs/pay-kit/next` adapter running in Hono,
  showing it is runtime-agnostic (illustrative; needs `hono`).

- **`nestjs.ts`** - injecting a configured `PayClient` into a NestJS service via
  the `@siyegs/pay-kit/nestjs` module (illustrative; needs `@nestjs/common`).

Swap `provider: "mock"` for `"paystack"`, `"flutterwave"` or `"zevpay"` (with a
real secret key) to run any of these against a live provider.
