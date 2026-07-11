import { timingSafeEqual } from "node:crypto";
import { PayKitError } from "./errors";
import type { ProviderContext, ProviderName } from "./types";

/**
 * Authenticated JSON request to a provider, with normalized error handling.
 * Both Paystack and Flutterwave use `Authorization: Bearer <secret>` and signal
 * application-level failure in the body (`status: false` / `status: "error"`),
 * so we treat those as errors even on HTTP 200.
 */
export async function providerRequest(
  ctx: ProviderContext,
  provider: ProviderName,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await ctx.fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${ctx.secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    throw new PayKitError(`Network error calling ${provider}`, {
      code: "network_error",
      provider,
      cause: err,
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!res.ok || body.status === false || body.status === "error") {
    const message =
      typeof body.message === "string"
        ? body.message
        : `${provider} request failed (${res.status})`;
    throw new PayKitError(message, {
      code: "provider_error",
      provider,
      statusCode: res.status,
      raw: body,
    });
  }

  return body;
}

/** Constant-time comparison of two hex/string signatures. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
