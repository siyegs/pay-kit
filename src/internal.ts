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
  // Bound the call with an AbortController so a hung connection can't block the
  // caller forever (and so a fallback client can move on). `timeoutMs <= 0`
  // disables it.
  const timeoutMs = ctx.timeoutMs ?? 0;
  const controller = timeoutMs > 0 ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    let res: Response;
    try {
      res = await ctx.fetch(url, {
        ...init,
        ...(controller ? { signal: controller.signal } : {}),
        headers: {
          Authorization: `Bearer ${ctx.secretKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      if (controller?.signal.aborted) {
        throw new PayKitError(`${provider} request timed out after ${timeoutMs}ms`, {
          code: "timeout",
          provider,
          cause: err,
        });
      }
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
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Constant-time comparison of two hex/string signatures. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
