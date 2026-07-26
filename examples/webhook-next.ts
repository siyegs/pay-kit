/**
 * Verifying a webhook in a Next.js App Router route handler.
 *
 * Save as `app/api/webhooks/pay/route.ts`. The `webhookRoute` helper reads the
 * RAW request body (so the signature stays valid), verifies it, dispatches the
 * normalized event, and returns the right status - 401 bad signature, 400
 * malformed, 500 if your handler throws (the provider then retries), 200 on ok.
 *
 * The same helper works in Remix, Hono, SvelteKit, Cloudflare Workers, Deno,
 * and Bun - anything with a Web `Request`/`Response`.
 */
import { createPayClient } from "../src";
import { webhookRoute } from "../src/adapters/next";

const pay = createPayClient({
  provider: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
  // For Flutterwave, also pass webhookSecret: process.env.FLW_HASH
});

export const POST = webhookRoute(pay, {
  onEvent: async (event) => {
    // Keep this idempotent - key it on event.reference; providers can redeliver.
    switch (event.type) {
      case "charge.success":
        // mark the order paid
        break;
      case "transfer.success":
        // reconcile the payout
        break;
    }
  },
  onError: (err) => {
    console.error("[pay-kit] webhook failed", err);
  },
});
