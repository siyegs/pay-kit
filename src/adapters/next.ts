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
import { PayKitError } from "../errors";
import type { ProviderName, WebhookEvent } from "../types";

/** The header each provider signs its webhook with. */
const SIGNATURE_HEADERS: Record<ProviderName, string> = {
  paystack: "x-paystack-signature",
  flutterwave: "verif-hash",
  zevpay: "x-zevpay-signature",
  mock: "x-paystack-signature",
};

/** The minimal client surface these helpers need (a `PayClient` satisfies it). */
export interface WebhookVerifier {
  readonly provider: ProviderName;
  webhooks: { construct(rawBody: string, signature: string): WebhookEvent };
}

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
  const headerName = SIGNATURE_HEADERS[client.provider] ?? SIGNATURE_HEADERS.paystack;
  const signature = request.headers.get(headerName) ?? "";
  // RAW bytes - do not JSON.parse and re-stringify, or the signature breaks.
  const rawBody = await request.text();
  return client.webhooks.construct(rawBody, signature);
}

export interface WebhookRouteOptions {
  /**
   * Handle a verified event. Keep it idempotent, keyed on `event.reference` -
   * providers may deliver the same event more than once. Throw to signal you
   * could not process it (the route replies 500 so the provider retries).
   */
  onEvent: (event: WebhookEvent) => void | Promise<void>;
  /** Observe verification/handler failures (logging, metrics). Optional. */
  onError?: (err: unknown) => void;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

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
      const badSignature = err instanceof PayKitError && err.code === "invalid_signature";
      return json(badSignature ? 401 : 400, { error: "invalid webhook" });
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
