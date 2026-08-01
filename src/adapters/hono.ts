/**
 * Hono webhook adapter for pay-kit (`@siyegs/pay-kit/hono`).
 *
 * Hono is Web-standard under the hood, so the `/next` helpers already work -
 * this adapter is the ergonomic wrapper: `webhookHandler` takes the Hono
 * `Context` directly (it reads `c.req.raw` for you, the signature footgun) and
 * returns a plain `Response`, which Hono serves as the handler result.
 *
 * No dependency on `hono` at runtime - the returned function just takes a
 * minimal `{ req: { raw: Request } }`-shaped context.
 *
 * @example
 * import { Hono } from "hono";
 * import { createPayClient } from "@siyegs/pay-kit";
 * import { webhookHandler } from "@siyegs/pay-kit/hono";
 *
 * const pay = createPayClient({
 *   provider: "paystack",
 *   secretKey: process.env.PAYSTACK_SECRET_KEY!,
 * });
 *
 * const app = new Hono();
 * app.post("/webhooks/pay", webhookHandler(pay, {
 *   onEvent: async (event) => {
 *     if (event.type === "charge.success") {
 *       // fulfil the order, idempotently keyed on event.reference
 *     }
 *   },
 * }));
 */
import { constructWebhookFromRequest, webhookRoute } from "./next";
import type { WebhookRouteOptions, WebhookVerifier } from "./core";

export type { WebhookRouteOptions, WebhookVerifier } from "./core";

/** The minimal Hono `Context` surface the handler needs. */
export interface HonoContextLike {
  req: { raw: Request };
}

/**
 * Build a Hono handler that verifies the webhook, dispatches the event, and
 * replies with the right status: `401` on a bad signature, `400` on a malformed
 * body, `500` if your handler throws (so the provider retries), `200` on
 * success. Pass it as the route handler for your webhook path.
 */
export function webhookHandler(
  client: WebhookVerifier,
  options: WebhookRouteOptions,
): (c: HonoContextLike) => Promise<Response> {
  const handle = webhookRoute(client, options);
  return (c) => handle(c.req.raw);
}

export { constructWebhookFromRequest };
