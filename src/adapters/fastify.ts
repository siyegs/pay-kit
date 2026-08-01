/**
 * Fastify webhook plugin for pay-kit (`@siyegs/pay-kit/fastify`).
 *
 * The raw-body footgun, solved: a webhook signature is verified against the
 * RAW request bytes, and Fastify's default JSON parser would parse (and lose)
 * them. The plugin registers a catch-all content-type parser
 * (`parseAs: "string"`) and the webhook route inside a single encapsulated
 * plugin scope, so the catch-all parser affects only this route - your other
 * routes keep Fastify's default parsing. Use `app.register(...)` with your
 * webhook path.
 *
 * No dependency on `fastify` at runtime - the returned function is a plain
 * Fastify plugin, so install this package alongside Fastify and register it.
 *
 * @example
 * import Fastify from "fastify";
 * import { createPayClient } from "@siyegs/pay-kit";
 * import { webhookPlugin } from "@siyegs/pay-kit/fastify";
 *
 * const pay = createPayClient({
 *   provider: "paystack",
 *   secretKey: process.env.PAYSTACK_SECRET_KEY!,
 * });
 *
 * const app = Fastify();
 * app.register(webhookPlugin(pay, {
 *   onEvent: async (event) => {
 *     if (event.type === "charge.success") {
 *       // fulfil the order, idempotently keyed on event.reference
 *     }
 *   },
 * }));
 */
import type { WebhookEvent } from "../types";
import {
  headerValue,
  isInvalidSignature,
  signatureHeader,
  type WebhookRouteOptions,
  type WebhookVerifier,
} from "./core";

export interface WebhookPluginOptions extends WebhookRouteOptions {
  /** Route to register the webhook under. Defaults to `/webhooks/pay`. */
  path?: string;
}

/** The minimal Fastify request surface. Fastify's `Request` satisfies it. */
export interface FastifyRequestLike {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/** The minimal Fastify reply surface. Fastify's `Reply` satisfies it. */
export interface FastifyReplyLike {
  code(statusCode: number): FastifyReplyLike;
  send(payload?: unknown): unknown;
}

/** The minimal Fastify instance surface the plugin needs. */
export interface FastifyLike {
  addContentTypeParser(
    contentType: string | string[],
    opts: { parseAs: "string" },
    parser: (request: unknown, body: string, done: (error: Error | null, value?: string) => void) => void,
  ): unknown;
  post(path: string, handler: (request: FastifyRequestLike, reply: FastifyReplyLike) => unknown): unknown;
}

/**
 * Verify a Fastify webhook request against its signature header and return the
 * normalized event. The plugin's content-type parser ensures `request.body` is
 * the raw body string. Throws `PayKitError` (`code: "invalid_signature"`) on a
 * signature mismatch. Lower-level helper - most users want `webhookPlugin`.
 */
export function constructWebhookFromRequest(
  client: WebhookVerifier,
  request: FastifyRequestLike,
): WebhookEvent {
  const rawBody = typeof request.body === "string" ? request.body : "";
  const signature = headerValue(request.headers, signatureHeader(client.provider));
  return client.webhooks.construct(rawBody, signature);
}

/**
 * A Fastify plugin that verifies webhooks, dispatches the event, and replies
 * with the right status: `401` on a bad signature, `400` on a malformed body,
 * `500` if your handler throws (so the provider retries), `200` on success.
 *
 * Register it with `app.register(webhookPlugin(pay, { onEvent, path? }))`. The
 * raw-body parsers are registered in the plugin's encapsulated scope, so other
 * routes keep Fastify's default parsing.
 *
 * Note: the wildcard content-type parser alone is NOT enough - Fastify's
 * built-in `application/json` parser wins over a wildcard, so the webhook
 * body would arrive JSON-parsed and the signature check would fail. The
 * plugin therefore registers `application/json` (and `text/plain`)
 * explicitly with `parseAs: "string"` alongside the wildcard fallback.
 */
export function webhookPlugin(
  client: WebhookVerifier,
  options: WebhookPluginOptions,
): (fastify: FastifyLike) => void {
  return (fastify) => {
    const asString = (
      _request: unknown,
      body: string,
      done: (error: Error | null, value?: string) => void,
    ) => done(null, body);
    // Built-ins win over wildcards in Fastify, so list the types providers
    // actually send explicitly before the catch-all.
    fastify.addContentTypeParser(["application/json", "text/plain"], { parseAs: "string" }, asString);
    fastify.addContentTypeParser("*/*", { parseAs: "string" }, asString);

    fastify.post(options.path ?? "/webhooks/pay", async (request, reply) => {
      let event: WebhookEvent;
      try {
        event = constructWebhookFromRequest(client, request);
      } catch (err) {
        options.onError?.(err);
        return reply.code(isInvalidSignature(err) ? 401 : 400).send({ error: "invalid webhook" });
      }

      try {
        await options.onEvent(event);
      } catch (err) {
        options.onError?.(err);
        // 500 tells the provider to retry delivery later.
        return reply.code(500).send({ error: "handler failed" });
      }

      return { received: true };
    });
  };
}
