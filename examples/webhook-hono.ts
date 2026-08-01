/**
 * Verifying a webhook in Hono with the `@siyegs/pay-kit/hono` adapter
 * (illustrative - needs `hono` and a real secret key / webhook secret).
 *
 * `webhookHandler` reads Hono's underlying raw request (`c.req.raw`) itself,
 * so the signature stays valid, and returns a plain `Response` Hono serves
 * directly. Replies: 401 bad signature, 400 malformed, 500 handler threw
 * (provider retries), 200 ok.
 */
import { Hono } from "hono";
import { createPayClient } from "../src";
import { webhookHandler } from "../src/adapters/hono";

const pay = createPayClient({
  provider: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
  // For Flutterwave, also pass webhookSecret: process.env.FLW_HASH
});

const app = new Hono();

app.post(
  "/webhooks/pay",
  webhookHandler(pay, {
    onEvent: async (event) => {
      // event is normalized: { type, reference, status?, amount?, currency?, raw }
      if (event.type === "charge.success") {
        // mark the order paid, idempotently keyed on event.reference
      }
    },
  }),
);

export default app;
