# Examples

Runnable snippets for pay-kit.

- **`checkout.ts`** - a full initialize -> verify -> refund flow using the keyless
  `mock` provider, so it runs with **no API keys**:

  ```bash
  bun run examples/checkout.ts
  ```

- **`fallback.ts`** - using `createFallbackClient` to fall through to a second
  provider on an outage (illustrative; needs real keys for both providers).

- **`webhook-express.ts`** - verifying a webhook with the `@siyegs/pay-kit/express`
  adapter, which collects the raw body itself (illustrative; needs `express` and
  a real secret key).

- **`webhook-next.ts`** - a Next.js App Router webhook route using the
  `@siyegs/pay-kit/next` adapter (also works in Remix, Hono, Workers, Deno, Bun).

- **`webhook-hono.ts`** - verifying a webhook with the `@siyegs/pay-kit/hono`
  adapter, which reads Hono's raw request for you (illustrative; needs `hono`).

- **`webhook-fastify.ts`** - verifying a webhook with the `@siyegs/pay-kit/fastify`
  plugin, which registers a scoped raw-body parser (illustrative; needs `fastify`).

- **`nestjs.ts`** - injecting a configured `PayClient` into a NestJS service via
  the `@siyegs/pay-kit/nestjs` module (illustrative; needs `@nestjs/common`).

Swap `provider: "mock"` for `"paystack"` or `"flutterwave"` (with a real secret
key) to run any of these against a live provider.
