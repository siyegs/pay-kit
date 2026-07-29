import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { createPayClient } from "../client";
import { PayKitError } from "../errors";
import { isChargeSuccess, isTransferFailed } from "../webhooks";
import { jsonBody, mockFetch } from "./helpers";

const SECRET = "sk_test_zevpay_123";
const WEBHOOK_SECRET = "whsec_zevpay_123";
const SESSION_ID = "ecc48011-e36e-4741-9b99-657f4a1ee86e";

function sign(rawBody: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

describe("zevpay: initialize", () => {
  it("creates a session and returns its id and checkout url", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        success: true,
        data: {
          session_id: SESSION_ID,
          reference: "ZVP-CKO-S-abc123",
          merchant_reference: "ORDER-1",
          checkout_url: `https://secure.zevpaycheckout.com/${SESSION_ID}`,
          amount: 500000,
          currency: "NGN",
        },
      },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    const res = await pay.initialize({
      amount: 500000,
      email: "a@b.com",
      reference: "ORDER-1",
      callbackUrl: "https://example.com/callback",
      metadata: { orderId: "1" },
    });

    // The session id is what `verify` takes, so that is the reference pay-kit returns.
    expect(res.reference).toBe(SESSION_ID);
    expect(res.authorizationUrl).toBe(`https://secure.zevpaycheckout.com/${SESSION_ID}`);

    expect(calls[0]!.url).toContain("/v1/checkout/session/initialize");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.amount).toBe(500000); // kobo passes through untouched
    expect(sent.email).toBe("a@b.com");
    expect(sent.reference).toBe("ORDER-1");
    expect(sent.callback_url).toBe("https://example.com/callback");
  });

  it("authenticates with both a bearer token and x-api-key", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { success: true, data: { session_id: SESSION_ID, checkout_url: "https://x" } },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    await pay.initialize({ amount: 500000, email: "a@b.com" });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(headers["x-api-key"]).toBe(SECRET);
  });

  it("rejects a split instead of silently dropping the vendor share", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { success: true, data: {} } }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    await expect(
      pay.initialize({ amount: 500000, email: "a@b.com", split: { subaccount: "SUB_1" } }),
    ).rejects.toMatchObject({ name: "PayKitError", code: "unsupported", provider: "zevpay" });
    expect(calls).toHaveLength(0);
  });

  it("surfaces the API's error message on a failed response", async () => {
    const { fetch } = mockFetch(() => ({
      status: 400,
      body: {
        success: false,
        error: { code: "HTTP_ERROR", message: "amount must not be less than 100" },
      },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    await expect(pay.initialize({ amount: 1, email: "a@b.com" })).rejects.toThrow(
      /amount must not be less than 100/,
    );
  });
});

describe("zevpay: verify", () => {
  it("maps a completed session to success", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        success: true,
        data: {
          session_id: SESSION_ID,
          reference: "ZVP-CKO-S-abc123",
          merchant_reference: "ORDER-1",
          status: "completed",
          amount: 500000,
          currency: "NGN",
          customer_email: "a@b.com",
          payment_method: "bank_transfer",
          paid_at: "2026-03-07T19:42:00.000Z",
        },
      },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    const res = await pay.verify(SESSION_ID);
    expect(res.status).toBe("success");
    expect(res.amount).toBe(500000);
    expect(res.channel).toBe("bank_transfer");
    expect(res.customer?.email).toBe("a@b.com");
    expect(calls[0]!.url).toContain(`/v1/checkout/session/${SESSION_ID}/verify`);
  });

  it("maps an expired session to abandoned and an active one to pending", async () => {
    for (const [status, expected] of [
      ["expired", "abandoned"],
      ["active", "pending"],
      ["failed", "failed"],
    ] as const) {
      const { fetch } = mockFetch(() => ({
        body: { success: true, data: { session_id: SESSION_ID, status, amount: 0 } },
      }));
      const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });
      expect((await pay.verify(SESSION_ID)).status).toBe(expected);
    }
  });
});

describe("zevpay: methods the adapter does not cover yet", () => {
  it("throws `unsupported` rather than calling the API", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { success: true, data: {} } }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    const attempts = [
      pay.refund("ref"),
      pay.chargeAuthorization({ authorizationCode: "tok", email: "a@b.com", amount: 1000 }),
      pay.listTransactions(),
      pay.createSubaccount({
        businessName: "V",
        bankCode: "058",
        accountNumber: "0123456789",
        percentageCharge: 20,
      }),
    ];

    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({ code: "unsupported", provider: "zevpay" });
    }
    expect(calls).toHaveLength(0);
  });
});

describe("zevpay: transfer", () => {
  it("sends a bank payout in kobo and keys it by ZevPay's reference", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        success: true,
        data: {
          reference: "ZVP-TRF-abc123",
          status: "pending",
          amount: 500000,
          merchant_reference: "payout_1",
        },
      },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    const res = await pay.transfer({
      amount: 500000,
      reference: "payout_1",
      reason: "Vendor payment",
      recipient: { accountNumber: "0123456789", bankCode: "058", name: "JOHN DOE" },
    });

    expect(res.status).toBe("pending");
    expect(res.reference).toBe("payout_1");
    expect(res.transferId).toBe("ZVP-TRF-abc123");

    expect(calls[0]!.url).toContain("/v1/checkout/transfer");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.type).toBe("bank_transfer");
    expect(sent.account_name).toBe("JOHN DOE");
    expect(sent.amount).toBe(500000);
    expect(sent.narration).toBe("Vendor payment");
  });

  it("resolves the account name when the caller omits it", async () => {
    const { fetch, calls } = mockFetch((url) => {
      if (url.includes("/banks/resolve")) {
        return { body: { success: true, data: { account_name: "ADA LOVELACE" } } };
      }
      return {
        body: { success: true, data: { reference: "ZVP-TRF-x", status: "completed", amount: 10000 } },
      };
    });
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    const res = await pay.transfer({
      amount: 10000,
      recipient: { accountNumber: "0123456789", bankCode: "058" },
    });

    expect(res.status).toBe("success");
    expect(calls[0]!.url).toContain("/v1/checkout/transfer/banks/resolve");
    expect(jsonBody(calls[1]!.init).account_name).toBe("ADA LOVELACE");
  });
});

describe("zevpay: verifyTransfer", () => {
  it("looks a payout up by its ZevPay reference", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        success: true,
        data: {
          reference: "ZVP-TRF-abc123",
          merchant_reference: "payout_1",
          status: "completed",
          amount: 500000,
        },
      },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    const res = await pay.verifyTransfer("ZVP-TRF-abc123");
    expect(res.status).toBe("success");
    expect(res.reference).toBe("payout_1");
    expect(calls[0]!.url).toContain("/v1/checkout/transfer/ZVP-TRF-abc123/verify");
  });

  it("treats a reversed payout as failed", async () => {
    const { fetch } = mockFetch(() => ({
      body: { success: true, data: { reference: "ZVP-TRF-abc123", status: "reversed" } },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });
    expect((await pay.verifyTransfer("ZVP-TRF-abc123")).status).toBe("failed");
  });
});

describe("zevpay: banks and balances", () => {
  it("normalizes the bank list", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        success: true,
        data: {
          banks: [
            { bankCode: "044", bankName: "Access Bank" },
            { bankCode: "058", bankName: "Guaranty Trust Bank" },
          ],
        },
      },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    expect(await pay.listBanks()).toEqual([
      { name: "Access Bank", code: "044" },
      { name: "Guaranty Trust Bank", code: "058" },
    ]);
    expect(calls[0]!.url).toContain("/v1/checkout/transfer/banks");
  });

  it("rejects a country other than NG", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { success: true, data: { banks: [] } } }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    await expect(pay.listBanks({ country: "GH" })).rejects.toMatchObject({ code: "config_error" });
    expect(calls).toHaveLength(0);
  });

  it("returns the wallet balance in kobo", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { success: true, data: { available_balance: 15000000, currency: "NGN" } },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    expect(await pay.getBalances()).toEqual([
      { currency: "NGN", available: 15000000, raw: { available_balance: 15000000, currency: "NGN" } },
    ]);
    expect(calls[0]!.url).toContain("/v1/checkout/transfer/balance");
  });

  it("resolves an account name", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        success: true,
        data: { account_name: "JOHN DOE", account_number: "0123456789", bank_code: "058" },
      },
    }));
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET, fetch });

    const res = await pay.resolveAccount({ accountNumber: "0123456789", bankCode: "058" });
    expect(res.accountName).toBe("JOHN DOE");
    expect(jsonBody(calls[0]!.init)).toEqual({
      account_number: "0123456789",
      bank_code: "058",
    });
  });
});

describe("zevpay: webhooks", () => {
  const charge = JSON.stringify({
    event: "charge.success",
    data: {
      reference: "ZVP-CKO-S-abc123",
      merchant_reference: "ORDER-1",
      amount: 500000,
      currency: "NGN",
      status: "completed",
      channel: "bank_transfer",
    },
  });

  it("accepts a valid HMAC-SHA256 signature and normalizes the event", () => {
    const pay = createPayClient({
      provider: "zevpay",
      secretKey: SECRET,
      webhookSecret: WEBHOOK_SECRET,
    });

    const event = pay.webhooks.construct(charge, sign(charge));
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("ORDER-1"); // your reference, not ZevPay's
    expect(event.status).toBe("success");
    expect(event.amount).toBe(500000);
    expect(event.currency).toBe("NGN");
  });

  it("falls back to ZevPay's reference when no merchant reference was set", () => {
    const raw = JSON.stringify({
      event: "charge.success",
      data: { reference: "ZVP-CKO-S-abc123", amount: 500000, status: "completed" },
    });
    const pay = createPayClient({
      provider: "zevpay",
      secretKey: SECRET,
      webhookSecret: WEBHOOK_SECRET,
    });
    expect(pay.webhooks.construct(raw, sign(raw)).reference).toBe("ZVP-CKO-S-abc123");
  });

  it("normalizes payout events", () => {
    const raw = JSON.stringify({
      event: "transfer.failed",
      data: { reference: "ZVP-TRF-xyz789", status: "failed", amount: 500000, currency: "NGN" },
    });
    const pay = createPayClient({
      provider: "zevpay",
      secretKey: SECRET,
      webhookSecret: WEBHOOK_SECRET,
    });

    const event = pay.webhooks.construct(raw, sign(raw));
    expect(event.type).toBe("transfer.failed");
    expect(event.reference).toBe("ZVP-TRF-xyz789");
    expect(event.status).toBe("failed");
  });

  it("produces events the exported type guards narrow", () => {
    const pay = createPayClient({
      provider: "zevpay",
      secretKey: SECRET,
      webhookSecret: WEBHOOK_SECRET,
    });

    const charged = pay.webhooks.construct(charge, sign(charge));
    expect(isChargeSuccess(charged)).toBe(true);

    const failed = JSON.stringify({
      event: "transfer.failed",
      data: { reference: "ZVP-TRF-xyz789", status: "failed", amount: 500000 },
    });
    expect(isTransferFailed(pay.webhooks.construct(failed, sign(failed)))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const pay = createPayClient({
      provider: "zevpay",
      secretKey: SECRET,
      webhookSecret: WEBHOOK_SECRET,
    });
    const signature = sign(charge);
    const tampered = charge.replace("500000", "1");

    try {
      pay.webhooks.construct(tampered, signature);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PayKitError);
      expect((err as PayKitError).code).toBe("invalid_signature");
    }
  });

  it("errors clearly when webhookSecret is not configured", () => {
    const pay = createPayClient({ provider: "zevpay", secretKey: SECRET });
    try {
      pay.webhooks.construct(charge, sign(charge));
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as PayKitError).code).toBe("config_error");
    }
  });
});
