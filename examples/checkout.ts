/**
 * A full checkout flow on the keyless mock provider - runs with no API keys:
 *   bun run examples/checkout.ts
 *
 * Swap `provider: "mock"` for "paystack" / "flutterwave" (with a real secretKey,
 * and a callbackUrl for Flutterwave) to run it against a live provider.
 */
import { createPayClient } from "../src";

const pay = createPayClient({ provider: "mock" });

// 1. Start a payment. Amounts are in subunits: 500000 = NGN 5,000.00
const init = await pay.initialize({
  amount: 500000,
  email: "customer@example.com",
  currency: "NGN",
  callbackUrl: "https://your-app.com/pay/callback",
  metadata: { orderId: "order_123" },
});
console.log("Redirect the customer to:", init.authorizationUrl);
console.log("Persist this reference:", init.reference);

// 2. After the customer returns, verify before fulfilling.
const result = await pay.verify(init.reference);
console.log("Payment status:", result.status, "amount:", result.amount);

if (result.status === "success") {
  console.log("Order fulfilled.");

  // 3. Later, refund part of it if needed (amount in subunits).
  const refund = await pay.refund(init.reference, { amount: 100000 });
  console.log("Refund status:", refund.status, "amount:", refund.amount);
}
