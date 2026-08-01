/**
 * Express webhook middleware for pay-kit (`@siyegs/pay-kit/express`).
 *
 * The raw-body footgun, solved: a webhook signature is verified against the
 * RAW request bytes. The middleware collects the body chunks itself (or uses
 * `req.body` if it is already a `Buffer`/string from `express.raw()`), so you
 * do NOT need to wire up `express.raw()` - and must NOT run a JSON body parser
 * on this route, since re-serializing the parsed object breaks the signature.
 *
 * No dependency on `express` at runtime - the returned function is plain
 * Express middleware, so install this package alongside Express and wire it in.
 *
 * @example
 * import express from "express";
 * import { createPayClient } from "@siyegs/pay-kit";
 * import { webhookMiddleware } from "@siyegs/pay-kit/express";
 *
 * const pay = createPayClient({
 *   provider: "paystack",
 *   secretKey: process.env.PAYSTACK_SECRET_KEY!,
 * });
 *
 * const app = express();
 * app.post("/webhooks/pay", webhookMiddleware(pay, {
 *   onEvent: async (event) => {
 *     if (event.type === "charge.success") {
 *       // fulfil the order, idempotently keyed on event.reference
 *     }
 *   },
 * }));
 */
import { PayKitError } from "../errors";
import type { WebhookEvent } from "../types";
import {
  headerValue,
  isInvalidSignature,
  signatureHeader,
  type WebhookRouteOptions,
  type WebhookVerifier,
} from "./core";

/**
 * The minimal request surface the middleware needs. Express's `Request`
 * satisfies it - no `express` types required.
 */
export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  /**
   * Set only if a body parser ran first (e.g. `express.raw()`). The middleware
   * falls back to collecting the stream when this is unset.
   */
  body?: unknown;
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
}

/** The minimal response surface. Express's `Response` satisfies it. */
export interface WebhookResponse {
  sendStatus(code: number): unknown;
}

/**
 * Read the raw body of an Express request as a string. Uses `req.body` when a
 * body parser already buffered it as a `Buffer`/string (`express.raw()`),
 * otherwise collects the request stream. Rejects with a `config_error`
 * `PayKitError` if a JSON parser left a parsed object - the raw bytes are
 * already lost, so the signature can never be verified.
 */
export function rawBodyString(request: WebhookRequest): Promise<string> {
  if (Buffer.isBuffer(request.body)) return Promise.resolve(request.body.toString("utf8"));
  if (typeof request.body === "string") return Promise.resolve(request.body);
  if (request.body !== undefined) {
    return Promise.reject(
      new PayKitError(
        "webhook body must be the raw bytes - do not run a JSON body parser before this middleware",
        { code: "config_error" },
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/**
 * Verify an Express request against its signature header and return the
 * normalized event. Throws `PayKitError` (`code: "invalid_signature"`) on a
 * signature mismatch. Lower-level helper - most users want
 * `webhookMiddleware` instead.
 */
export async function constructWebhookFromRequest(
  client: WebhookVerifier,
  request: WebhookRequest,
): Promise<WebhookEvent> {
  const rawBody = await rawBodyString(request);
  const signature = headerValue(request.headers, signatureHeader(client.provider));
  return client.webhooks.construct(rawBody, signature);
}

/**
 * Express middleware that verifies the webhook, dispatches the event, and
 * replies with the right status: `401` on a bad signature, `400` on a malformed
 * body, `500` if your handler throws (so the provider retries), `200` on
 * success. Mount it directly on the webhook route - no `express.raw()` needed.
 */
export function webhookMiddleware(
  client: WebhookVerifier,
  options: WebhookRouteOptions,
): (request: WebhookRequest, response: WebhookResponse) => void {
  return (request, response) => {
    constructWebhookFromRequest(client, request).then(
      (event) => {
        Promise.resolve()
          .then(() => options.onEvent(event))
          .then(
            () => response.sendStatus(200),
            (err) => {
              options.onError?.(err);
              // 500 tells the provider to retry delivery later.
              response.sendStatus(500);
            },
          );
      },
      (err) => {
        options.onError?.(err);
        response.sendStatus(isInvalidSignature(err) ? 401 : 400);
      },
    );
  };
}
