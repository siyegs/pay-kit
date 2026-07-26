import { describe, expect, it } from "bun:test";
import { createPayClient } from "../client";
import { createFallbackClient } from "../fallback";
import { isRetryableError, PayKitError } from "../errors";

/** A fetch that never resolves until its AbortSignal fires, then rejects. */
function hangingFetch(): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new Error("aborted")));
      // Otherwise hang forever - the timeout must be what ends the call.
    })) as unknown as typeof fetch;
}

describe("request timeout", () => {
  it("aborts a hung request and throws a `timeout` PayKitError", async () => {
    const pay = createPayClient({
      provider: "paystack",
      secretKey: "sk",
      fetch: hangingFetch(),
      timeout: 20,
    });

    await expect(pay.initialize({ amount: 1000, email: "a@b.com" })).rejects.toMatchObject({
      name: "PayKitError",
      code: "timeout",
      provider: "paystack",
    });
  });

  it("classifies a timeout error as retryable", () => {
    const err = new PayKitError("timed out", { code: "timeout", provider: "paystack" });
    expect(isRetryableError(err)).toBe(true);
  });

  it("falls back to the next provider when the first times out", async () => {
    // Paystack hangs (times out); Flutterwave answers immediately.
    const fetchImpl = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.paystack.co")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "success", data: { link: "https://flw/checkout" } }),
      } as Response;
    }) as unknown as typeof fetch;

    const pay = createFallbackClient({
      providers: [
        { provider: "paystack", secretKey: "sk" },
        { provider: "flutterwave", secretKey: "flw" },
      ],
      fetch: fetchImpl,
      timeout: 20,
    });

    const res = await pay.initialize({
      amount: 500000,
      email: "a@b.com",
      callbackUrl: "https://example.com/callback",
    });
    expect(res.provider).toBe("flutterwave");
    expect(res.authorizationUrl).toBe("https://flw/checkout");
  });

  it("does not abort a normal call when the timeout is disabled (0)", async () => {
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ status: true, data: { authorization_url: "u", reference: "r" } }),
      }) as Response) as unknown as typeof fetch;

    const pay = createPayClient({
      provider: "paystack",
      secretKey: "sk",
      fetch: fetchImpl,
      timeout: 0,
    });

    const res = await pay.initialize({ amount: 1000, email: "a@b.com" });
    expect(res.authorizationUrl).toBe("u");
  });
});
