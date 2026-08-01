/**
 * Verifying a webhook in Express with the `@siyegs/pay-kit/express` adapter
 * (illustrative - needs `express` and a real secret key / webhook secret).
 *
 * The adapter collects the RAW request bytes itself, so the signature stays
 * valid - no `express.raw()` needed, and no JSON body parser on this route
 * (a parsed-and-re-serialized body would break verification).
 */
import express from "express";
import { createPayClient } from "../src";
import { webhookMiddleware } from "../src/adapters/express";

const pay = createPayClient({
  provider: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
  // For Flutterwave, also pass webhookSecret: process.env.FLW_HASH
});

const app = express();

app.post(
  "/webhooks/pay",
  webhookMiddleware(pay, {
    onEvent: async (event) => {
      // event is normalized: { type, reference, status?, amount?, currency?, raw }
      if (event.type === "charge.success") {
        // mark the order paid, idempotently keyed on event.reference
      }
    },
    onError: (err) => console.error("webhook rejected", err),
  }),
);

app.listen(3000);
