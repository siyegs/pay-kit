/**
 * Verifying a webhook in an Express handler (illustrative - needs `express`
 * and a real secret key / webhook secret).
 *
 * The critical detail: pass the RAW request body to `construct`, not a parsed
 * and re-serialized object, or signature verification will fail. Use
 * `express.raw()` for the webhook route.
 */
import express from "express";
import { createPayClient, PayKitError } from "../src";

const pay = createPayClient({
  provider: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
  // For Flutterwave, also pass webhookSecret: process.env.FLW_HASH
});

const app = express();

app.post("/webhooks/pay", express.raw({ type: "*/*" }), (req, res) => {
  // Paystack signs with `x-paystack-signature`; Flutterwave sends `verif-hash`.
  const signature =
    (req.headers["x-paystack-signature"] as string) ??
    (req.headers["verif-hash"] as string) ??
    "";

  try {
    const event = pay.webhooks.construct(req.body.toString(), signature);
    // event is normalized: { type, reference, status?, amount?, currency?, raw }
    if (event.type === "charge.success") {
      // mark the order paid, idempotently keyed on event.reference
    }
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof PayKitError && err.code === "invalid_signature") {
      return res.sendStatus(401);
    }
    res.sendStatus(400);
  }
});

app.listen(3000);
