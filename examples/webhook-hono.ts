/**
 * The same `@siyegs/pay-kit/next` webhook adapter in Hono (illustrative - needs
 * `hono`). Nothing about it is Next-specific: `webhookRoute` returns a plain
 * `(request: Request) => Promise<Response>`, so any Web-standard runtime can use
 * it. Here Hono hands it the raw request via `c.req.raw`.
 *
 * The identical handler works in Remix (`action`), SvelteKit (`+server.ts`),
 * Cloudflare Workers, Deno, and Bun.
 */
import { Hono } from "hono";
import { createPayClient } from "../src";
import { webhookRoute } from "../src/adapters/next";

const pay = createPayClient({
  provider: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
});

const handlePayWebhook = webhookRoute(pay, {
  onEvent: async (event) => {
    if (event.type === "charge.success") {
      // fulfil the order, idempotently keyed on event.reference
    }
  },
});

const app = new Hono();

// Pass Hono's underlying Web Request straight through - the adapter reads the
// raw body itself, so the signature stays valid.
app.post("/webhooks/pay", (c) => handlePayWebhook(c.req.raw));

export default app;
