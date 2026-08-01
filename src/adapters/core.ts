/**
 * Shared internals for the framework webhook adapters (`/next`, `/express`,
 * `/hono`, `/fastify`). Not part of the public API - imported by the adapters
 * themselves.
 */
import { PayKitError } from "../errors";
import type { ProviderName, WebhookEvent } from "../types";

/** The header each provider signs its webhook with. */
export const SIGNATURE_HEADERS: Record<ProviderName, string> = {
  paystack: "x-paystack-signature",
  flutterwave: "verif-hash",
  mock: "x-paystack-signature",
};

/** Resolve the signature header name for a provider (mock falls back to Paystack's). */
export function signatureHeader(provider: ProviderName): string {
  return SIGNATURE_HEADERS[provider] ?? SIGNATURE_HEADERS.paystack;
}

/** Read a possibly-array header value as a single string. */
export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const value = headers[name];
  if (value === undefined) return "";
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

/** The minimal client surface the adapters need (a `PayClient` satisfies it). */
export interface WebhookVerifier {
  readonly provider: ProviderName;
  webhooks: { construct(rawBody: string, signature: string): WebhookEvent };
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

/** Build a Web-standard JSON `Response`. */
export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** True when the error is a webhook signature mismatch (reply 401). */
export function isInvalidSignature(err: unknown): boolean {
  return err instanceof PayKitError && err.code === "invalid_signature";
}
