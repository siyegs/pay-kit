import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { createPayClient } from "../client";
import { PayKitError } from "../errors";
import { authHeader, jsonBody, mockFetch } from "./helpers";

const SECRET = "sk_test_123";

describe("paystack: initialize", () => {
  it("posts subunit amount and returns the checkout url + reference", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/abc",
          access_code: "acc_1",
          reference: "ref_1",
        },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.initialize({
      amount: 500000,
      email: "a@b.com",
      reference: "ref_1",
    });

    expect(res.authorizationUrl).toBe("https://checkout.paystack.com/abc");
    expect(res.reference).toBe("ref_1");
    expect(res.accessCode).toBe("acc_1");

    const call = calls[0]!;
    expect(call.url).toContain("/transaction/initialize");
    expect(call.init.method).toBe("POST");
    expect(authHeader(call.init)).toBe(`Bearer ${SECRET}`);
    const sent = jsonBody(call.init);
    expect(sent.amount).toBe(500000);
    expect(sent.email).toBe("a@b.com");
    expect(sent.currency).toBe("NGN");
  });

  it("auto-generates a reference when none is given", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: true, data: { authorization_url: "u", reference: "server_ref" } },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await pay.initialize({ amount: 1000, email: "a@b.com" });
    const sent = jsonBody(calls[0]!.init);
    expect(typeof sent.reference).toBe("string");
    expect(String(sent.reference).length).toBeGreaterThan(0);
  });

  it("throws PayKitError on provider failure", async () => {
    const { fetch } = mockFetch(() => ({
      status: 400,
      body: { status: false, message: "Invalid key" },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await expect(pay.initialize({ amount: 1000, email: "a@b.com" })).rejects.toMatchObject({
      name: "PayKitError",
      code: "provider_error",
      provider: "paystack",
    });
  });
});

describe("paystack: verify", () => {
  it("normalizes status and amount", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: {
          reference: "ref_1",
          status: "success",
          amount: 500000,
          currency: "NGN",
          channel: "card",
          customer: { email: "a@b.com" },
        },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.verify("ref_1");
    expect(res.status).toBe("success");
    expect(res.amount).toBe(500000);
    expect(res.currency).toBe("NGN");
    expect(res.customer?.email).toBe("a@b.com");
    expect(calls[0]!.url).toContain("/transaction/verify/ref_1");
  });

  it("maps unknown provider status to pending", async () => {
    const { fetch } = mockFetch(() => ({
      body: { status: true, data: { reference: "r", status: "ongoing", amount: 100, currency: "NGN" } },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });
    const res = await pay.verify("r");
    expect(res.status).toBe("pending");
  });
});

describe("paystack: refund", () => {
  it("posts a full refund using the transaction reference", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: { status: "processed", amount: 500000, transaction: { reference: "ref_1" } },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.refund("ref_1");
    expect(res.status).toBe("processed");
    expect(res.amount).toBe(500000);
    expect(res.reference).toBe("ref_1");

    const call = calls[0]!;
    expect(call.url).toContain("/refund");
    expect(call.init.method).toBe("POST");
    const sent = jsonBody(call.init);
    expect(sent.transaction).toBe("ref_1");
    expect(sent.amount).toBeUndefined(); // full refund omits amount
  });

  it("includes the amount for a partial refund", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: { status: "pending", amount: 20000, transaction: { reference: "ref_1" } },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.refund("ref_1", { amount: 20000 });
    expect(res.status).toBe("pending");
    expect(jsonBody(calls[0]!.init).amount).toBe(20000);
  });
});

describe("paystack: transfer", () => {
  it("creates a recipient, then sends the payout in kobo", async () => {
    const { fetch, calls } = mockFetch((url) => {
      if (url.includes("/transferrecipient")) {
        return { body: { status: true, data: { recipient_code: "RCP_abc" } } };
      }
      return {
        body: {
          status: true,
          data: { status: "success", reference: "trf_1", amount: 500000, transfer_code: "TRF_xyz" },
        },
      };
    });
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.transfer({
      amount: 500000,
      reference: "trf_1",
      reason: "payout",
      recipient: { accountNumber: "0001234567", bankCode: "058", name: "Ada" },
    });

    expect(res.status).toBe("success");
    expect(res.reference).toBe("trf_1");
    expect(res.recipientCode).toBe("RCP_abc");
    expect(res.transferId).toBe("TRF_xyz");
    expect(res.amount).toBe(500000);

    expect(calls[0]!.url).toContain("/transferrecipient");
    const recipient = jsonBody(calls[0]!.init);
    expect(recipient.type).toBe("nuban");
    expect(recipient.account_number).toBe("0001234567");
    expect(recipient.bank_code).toBe("058");

    expect(calls[1]!.url).toContain("/transfer");
    const transfer = jsonBody(calls[1]!.init);
    expect(transfer.amount).toBe(500000);
    expect(transfer.recipient).toBe("RCP_abc");
    expect(transfer.source).toBe("balance");
  });

  it("maps a pending transfer status", async () => {
    const { fetch } = mockFetch((url) => {
      if (url.includes("/transferrecipient")) {
        return { body: { status: true, data: { recipient_code: "RCP_1" } } };
      }
      return { body: { status: true, data: { status: "pending", reference: "trf_2" } } };
    });
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.transfer({
      amount: 10000,
      recipient: { accountNumber: "0001234567", bankCode: "058" },
    });
    expect(res.status).toBe("pending");
  });

  it("throws when no recipient code comes back", async () => {
    const { fetch } = mockFetch(() => ({ body: { status: true, data: {} } }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await expect(
      pay.transfer({ amount: 10000, recipient: { accountNumber: "0001234567", bankCode: "058" } }),
    ).rejects.toThrow(PayKitError);
  });
});

describe("paystack: webhooks", () => {
  const raw = JSON.stringify({
    event: "charge.success",
    data: { reference: "ref_1", status: "success", amount: 500000, currency: "NGN" },
  });

  function sign(body: string): string {
    return createHmac("sha512", SECRET).update(body).digest("hex");
  }

  it("accepts a correctly signed event and normalizes it", () => {
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
    const event = pay.webhooks.construct(raw, sign(raw));
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("ref_1");
    expect(event.status).toBe("success");
    expect(event.amount).toBe(500000);
  });

  it("rejects a tampered body / wrong signature", () => {
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
    expect(() => pay.webhooks.construct(raw, "deadbeef")).toThrow(PayKitError);
    try {
      pay.webhooks.construct(raw, "deadbeef");
    } catch (err) {
      expect((err as PayKitError).code).toBe("invalid_signature");
    }
  });
});

describe("config", () => {
  it("throws when secretKey is missing", () => {
    expect(() => createPayClient({ provider: "paystack", secretKey: "" })).toThrow(PayKitError);
  });
});
