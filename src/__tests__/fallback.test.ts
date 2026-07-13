import { describe, expect, it } from "bun:test";
import { createFallbackClient } from "../fallback";
import { PayKitError } from "../errors";

/** Build a fetch that routes by URL host, recording every call. */
function router(
  handlers: {
    paystack?: (url: string) => { status?: number; body?: unknown; throw?: boolean };
    flutterwave?: (url: string) => { status?: number; body?: unknown; throw?: boolean };
  },
): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    const isPaystack = url.includes("api.paystack.co");
    const handler = isPaystack ? handlers.paystack : handlers.flutterwave;
    const res = handler ? handler(url) : { body: {} };
    if (res.throw) throw new Error("ECONNREFUSED");
    const status = res.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => res.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, urls };
}

const PROVIDERS = [
  { provider: "paystack" as const, secretKey: "sk" },
  { provider: "flutterwave" as const, secretKey: "flw" },
];

describe("fallback: initialize", () => {
  it("falls back to the next provider on a network error", async () => {
    const { fetch, urls } = router({
      paystack: () => ({ throw: true }),
      flutterwave: () => ({ body: { status: "success", data: { link: "https://flw/checkout" } } }),
    });
    const pay = createFallbackClient({ providers: PROVIDERS, fetch });

    const res = await pay.initialize({ amount: 500000, email: "a@b.com" });
    expect(res.provider).toBe("flutterwave");
    expect(res.authorizationUrl).toBe("https://flw/checkout");
    expect(urls.some((u) => u.includes("api.paystack.co"))).toBe(true);
    expect(urls.some((u) => u.includes("api.flutterwave.com"))).toBe(true);
  });

  it("falls back on an HTTP 5xx", async () => {
    const { fetch } = router({
      paystack: () => ({ status: 503, body: { status: false, message: "unavailable" } }),
      flutterwave: () => ({ body: { status: "success", data: { link: "https://flw/x" } } }),
    });
    const pay = createFallbackClient({ providers: PROVIDERS, fetch });

    const res = await pay.initialize({ amount: 1000, email: "a@b.com" });
    expect(res.provider).toBe("flutterwave");
  });

  it("does NOT fall back on a non-retryable 400", async () => {
    const { fetch, urls } = router({
      paystack: () => ({ status: 400, body: { status: false, message: "bad request" } }),
      flutterwave: () => ({ body: { status: "success", data: { link: "x" } } }),
    });
    const pay = createFallbackClient({ providers: PROVIDERS, fetch });

    await expect(pay.initialize({ amount: 1000, email: "a@b.com" })).rejects.toMatchObject({
      name: "PayKitError",
      code: "provider_error",
      provider: "paystack",
    });
    // Flutterwave must never be tried on a client error.
    expect(urls.every((u) => !u.includes("api.flutterwave.com"))).toBe(true);
  });

  it("uses the first provider when it succeeds", async () => {
    const { fetch, urls } = router({
      paystack: () => ({ body: { status: true, data: { authorization_url: "https://ps/x", reference: "r" } } }),
      flutterwave: () => ({ body: { status: "success", data: { link: "https://flw/x" } } }),
    });
    const pay = createFallbackClient({ providers: PROVIDERS, fetch });

    const res = await pay.initialize({ amount: 1000, email: "a@b.com" });
    expect(res.provider).toBe("paystack");
    expect(urls.every((u) => !u.includes("api.flutterwave.com"))).toBe(true);
  });
});

describe("fallback: routing", () => {
  it("routes verify to the named provider", async () => {
    const { fetch, urls } = router({
      paystack: () => ({
        body: { status: true, data: { reference: "r", status: "success", amount: 100, currency: "NGN" } },
      }),
    });
    const pay = createFallbackClient({ providers: PROVIDERS, fetch });

    const res = await pay.verify("paystack", "r");
    expect(res.status).toBe("success");
    expect(urls[0]).toContain("api.paystack.co");
  });

  it("routes transfer to the named provider only (no fallback)", async () => {
    const { fetch, urls } = router({
      flutterwave: () => ({ body: { status: "success", data: { id: 1, status: "SUCCESSFUL", amount: 100 } } }),
    });
    const pay = createFallbackClient({ providers: PROVIDERS, fetch });

    const res = await pay.transfer("flutterwave", {
      amount: 10000,
      recipient: { accountNumber: "0690000040", bankCode: "044" },
    });

    expect(res.status).toBe("success");
    // Only Flutterwave is ever called - a payout must not be retried elsewhere.
    expect(urls.every((u) => u.includes("api.flutterwave.com"))).toBe(true);
  });

  it("client(provider) returns a usable single-provider client", async () => {
    const { fetch } = router({
      paystack: () => ({ body: { status: true, data: { authorization_url: "u", reference: "r" } } }),
    });
    const pay = createFallbackClient({ providers: PROVIDERS, fetch });
    const res = await pay.client("paystack").initialize({ amount: 100, email: "a@b.com" });
    expect(res.authorizationUrl).toBe("u");
  });
});

describe("fallback: config", () => {
  it("throws when no providers are given", () => {
    expect(() => createFallbackClient({ providers: [] })).toThrow(PayKitError);
  });

  it("throws when routing to an unconfigured provider", () => {
    const pay = createFallbackClient({ providers: [{ provider: "paystack", secretKey: "sk" }] });
    expect(() => pay.client("flutterwave")).toThrow(PayKitError);
  });
});
