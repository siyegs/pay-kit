/**
 * Verifying a webhook in Fastify with the `@siyegs/pay-kit/fastify` adapter
 * (illustrative - needs `fastify` and a real secret key / webhook secret).
 *
 * The plugin registers a catch-all content-type parser (`parseAs: "string"`)
 * and the webhook route inside one encapsulated scope, so the raw body reaches
 * the handler as a string (signature stays valid) while your other routes keep
 * Fastify's default body parsing. Replies: 401 bad signature, 400 malformed,
 * 500 handler threw (provider retries), 200 ok.
 */
import Fastify from "fastify";
import { createPayClient } from "../src";
import { webhookPlugin } from "../src/adapters/fastify";

const pay = createPayClient({
  provider: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
  // For Flutterwave, also pass webhookSecret: process.env.FLW_HASH
});

const app = Fastify();

app.register(
  webhookPlugin(pay, {
    path: "/webhooks/pay",
    onEvent: async (event) => {
      // event is normalized: { type, reference, status?, amount?, currency?, raw }
      if (event.type === "charge.success") {
        // mark the order paid, idempotently keyed on event.reference
      }
    },
  }),
);

await app.listen({ port: 3000 });
