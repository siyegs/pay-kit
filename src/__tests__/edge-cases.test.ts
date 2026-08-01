/**
 * Edge-response-shape tests: how the SDK behaves when providers return
 * malformed or degenerate payloads (non-JSON 4xx bodies, HTTP 200 with
 * `status: false`, `data: null`, missing fields, rate limits).
 */
import { describe, expect, it } from "bun:test";
import { createPayClient } from "../client";
import { createFallbackClient } from "../fallback";
import { PayKitError, isRetryableError } from "../errors";
import { mockFetch } from "./helpers";

const SECRET = "sk_test_123";

describe("edge: non-JSON / non-2xx responses", () => {
  it("an HTML error page becomes a provider_error with the status code, not a crash", async () => {
    const { fetch } = mockFetch(() => ({
      status: 502,
      body: "<html><body>Bad Gateway</body></html>",
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const err = await pay
      .initialize({ amount: 100, email: "a@b.com" })
      .then(() => null, (e: unknown) => e);

    expect(err).toBeInstanceOf(PayKitError);
    const payErr = err as PayKitError;
    expect(payErr.code).toBe("provider_error");
    expect(payErr.statusCode).toBe(502);
    expect(payErr.message).toMatch(/502/);
    expect(isRetryableError(payErr)).toBe(true);
  });

  it("a 429 rate limit surfaces statusCode=429 and is retryable", async () => {
    const { fetch } = mockFetch(() => ({
      status: 429,
      body: { message: "Too many requests" },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const err = await pay
      .getBalances()
      .then(() => null, (e: unknown) => e) as PayKitError;
    expect(err.code).toBe("provider_error");
    expect(err.statusCode).toBe(429);
    expect(isRetryableError(err)).toBe(true);
  });

  it("a 401 with no message body falls back to a sensible message", async () => {
    const { fetch } = mockFetch(() => ({ status: 401, body: "" }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const err = await pay
      .initialize({ amount: 100, email: "a@b.com" })
      .then(() => null, (e: unknown) => e) as PayKitError;
    expect(err.code).toBe("provider_error");
    expect(err.message).toMatch(/401/);
    expect(isRetryableError(err)).toBe(false); // client error - not retryable
  });
});

describe("edge: app-level failures on HTTP 200", () => {
  it("Paystack status:false is a provider_error even on HTTP 200", async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: { status: false, message: "Invalid email address" },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await expect(pay.initialize({ amount: 100, email: "nope" })).rejects.toMatchObject({
      code: "provider_error",
      message: "Invalid email address",
      statusCode: 200,
    });
  });

  it("Flutterwave status:'error' is a provider_error even on HTTP 200", async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: { status: "error", message: "Invalid transaction reference" },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    await expect(pay.verify("ref")).rejects.toMatchObject({
      code: "provider_error",
      message: "Invalid transaction reference",
    });
  });
});

describe("edge: degenerate data payloads", () => {
  it("data:null on a success response does not crash verify", async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: { status: true, data: null },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const verified = await pay.verify("ref");
    // Degenerate payload -> mapped as an unknown/pending transaction.
    expect(verified.status).toBe("pending");
    expect(verified.amount).toBe(0);
  });

  it("empty data array on listTransactions yields an empty list", async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: { status: true, data: [] },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const list = await pay.listTransactions({ perPage: 5 });
    expect(list.transactions).toEqual([]);
  });

  it("missing fields in plan data map to empty-safe values", async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: { status: true, data: {} },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const plan = await pay.fetchPlan("PLN_x");
    expect(plan.id).toBe("");
    expect(plan.name).toBe("");
    expect(plan.amount).toBeUndefined();
  });

  it("getBalances with non-array data returns an empty array", async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: { status: true, data: null },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const balances = await pay.getBalances();
    expect(balances).toEqual([]);
  });

  it("malformed JSON body on a 200 is treated as an empty payload (no crash)", async () => {
    const { fetch } = mockFetch(() => ({
      status: 200,
      body: "totally-not-json{{{",
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const list = await pay.listTransactions({ perPage: 5 });
    expect(list.transactions).toEqual([]);
  });
});

describe("edge: fallback moves on retryable provider errors", () => {
  it("moves to the next provider when the first returns 429", async () => {
    let calls = 0;
    const { fetch } = mockFetch(() => {
      calls++;
      if (calls === 1) {
        return { status: 429, body: { message: "rate limited" } };
      }
      return {
        status: 200,
        body: {
          status: true,
          data: { authorization_url: "https://pay.example/ok", reference: "ref_fb" },
        },
      };
    });
    const fallback = createFallbackClient({
      providers: [
        { provider: "paystack", secretKey: SECRET },
        { provider: "flutterwave", secretKey: SECRET },
      ],
      fetch,
    });

    const init = await fallback.initialize({
      amount: 100,
      email: "a@b.com",
      callbackUrl: "https://app.example.com/cb",
    });
    expect(init.provider).toBe("flutterwave");
    expect(calls).toBe(2);
  });

  it("does NOT move on a non-retryable 401 (would fail the same way everywhere)", async () => {
    let calls = 0;
    const { fetch } = mockFetch(() => {
      calls++;
      return { status: 401, body: { message: "unauthorized" } };
    });
    const fallback = createFallbackClient({
      providers: [
        { provider: "paystack", secretKey: SECRET },
        { provider: "flutterwave", secretKey: SECRET },
      ],
      fetch,
    });

    await expect(fallback.initialize({ amount: 100, email: "a@b.com" })).rejects.toMatchObject(
      { code: "provider_error", statusCode: 401 },
    );
    expect(calls).toBe(1);
  });
});
