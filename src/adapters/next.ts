/**
 * Web-standard webhook helpers for `Request`/`Response` runtimes.
 *
 * The flagship target is a Next.js App Router route handler, but these use only
 * the Fetch API, so they work unchanged in Remix, Hono, SvelteKit, Cloudflare
 * Workers, Deno, and Bun.
 *
 * The one detail these solve for you: a webhook signature is verified against
 * the RAW request bytes. Frameworks that parse JSON for you (and then let you
 * re-serialize it) silently break verification. `request.text()` reads the raw
 * body before anything touches it.
 *
 * @example
 * // app/api/webhooks/pay/route.ts (Next.js App Router)
 * import { createPayClient } from "@siyegs/pay-kit";
 * import { webhookRoute } from "@siyegs/pay-kit/next";
 *
 * const pay = createPayClient({ provider: "paystack", secretKey: process.env.PAYSTACK_SECRET_KEY! });
 *
 * export const POST = webhookRoute(pay, {
 *   onEvent: async (event) => {
 *     if (event.type === "charge.success") {
 *       // fulfil the order, idempotently keyed on event.reference
 *     }
 *   },
 * });
 */
import type { WebhookEvent } from "../types";
import {
  isInvalidSignature,
  json,
  signatureHeader,
  type WebhookRouteOptions,
  type WebhookVerifier,
} from "./core";

export type { WebhookRouteOptions, WebhookVerifier } from "./core";

/**
 * Read the raw body and the provider's signature header from a Web `Request`,
 * verify it, and return the normalized event. Throws `PayKitError`
 * (`code: "invalid_signature"`) if the signature does not match.
 *
 * Pass a single-provider client. On a fallback client, get one first with
 * `pay.client(provider)`.
 */
export async function constructWebhookFromRequest(
  client: WebhookVerifier,
  request: Request,
): Promise<WebhookEvent> {
  const signature = request.headers.get(signatureHeader(client.provider)) ?? "";
  // RAW bytes - do not JSON.parse and re-stringify, or the signature breaks.
  const rawBody = await request.text();
  return client.webhooks.construct(rawBody, signature);
}

/**
 * Build a Web-standard route handler `(request: Request) => Promise<Response>`
 * that verifies the webhook, dispatches the event, and replies with the right
 * status: `401` on a bad signature, `400` on a malformed body, `500` if your
 * handler throws (so the provider retries), `200` on success. In Next.js App
 * Router, export it directly as `POST`.
 */
export function webhookRoute(
  client: WebhookVerifier,
  options: WebhookRouteOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    let event: WebhookEvent;
    try {
      event = await constructWebhookFromRequest(client, request);
    } catch (err) {
      options.onError?.(err);
      return json(isInvalidSignature(err) ? 401 : 400, { error: "invalid webhook" });
    }

    try {
      await options.onEvent(event);
    } catch (err) {
      options.onError?.(err);
      // 500 tells the provider to retry delivery later.
      return json(500, { error: "handler failed" });
    }

    return json(200, { received: true });
  };
}
