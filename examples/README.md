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

Swap `provider: "mock"` for `"paystack"` or `"flutterwave"` (with a real secret
key) to run any of these against a live provider.
