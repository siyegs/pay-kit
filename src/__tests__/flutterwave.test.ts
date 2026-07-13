import { describe, expect, it } from "bun:test";
import { createPayClient } from "../client";
import { PayKitError } from "../errors";
import { jsonBody, mockFetch } from "./helpers";

const SECRET = "FLWSECK_TEST-123";
const HASH = "my-secret-hash";

describe("flutterwave: initialize", () => {
  it("converts subunits to major units and returns the payment link", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: "success", data: { link: "https://checkout.flutterwave.com/xyz" } },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.initialize({ amount: 500000, email: "a@b.com", reference: "tx_1" });

    expect(res.authorizationUrl).toBe("https://checkout.flutterwave.com/xyz");
    expect(res.reference).toBe("tx_1");

    const sent = jsonBody(calls[0]!.init);
    expect(calls[0]!.url).toContain("/v3/payments");
    expect(sent.amount).toBe(5000); // 500000 kobo -> 5000 naira
    expect(sent.tx_ref).toBe("tx_1");
    expect((sent.customer as Record<string, unknown>).email).toBe("a@b.com");
  });
});

describe("flutterwave: verify", () => {
  it("normalizes 'successful' and converts amount back to subunits", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: "success",
        data: { tx_ref: "tx_1", status: "successful", amount: 5000, currency: "NGN" },
      },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.verify("tx_1");
    expect(res.status).toBe("success");
    expect(res.amount).toBe(500000); // 5000 naira -> 500000 kobo
    expect(calls[0]!.url).toContain("verify_by_reference?tx_ref=tx_1");
  });
});

describe("flutterwave: refund", () => {
  it("resolves the transaction id from the reference, then posts the refund", async () => {
    const { fetch, calls } = mockFetch((url) => {
      if (url.includes("verify_by_reference")) {
        return {
          body: {
            status: "success",
            data: { id: 998877, tx_ref: "tx_1", status: "successful", amount: 5000, currency: "NGN" },
          },
        };
      }
      return { body: { status: "success", data: { status: "completed", amount_refunded: 5000 } } };
    });
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.refund("tx_1");
    expect(res.status).toBe("processed");
    expect(res.amount).toBe(500000); // 5000 naira refunded -> 500000 kobo
    expect(res.reference).toBe("tx_1");

    // first call resolves the id, second call refunds against it
    expect(calls[0]!.url).toContain("verify_by_reference?tx_ref=tx_1");
    expect(calls[1]!.url).toContain("/v3/transactions/998877/refund");
    expect(calls[1]!.init.method).toBe("POST");
  });

  it("errors when the reference has no matching transaction", async () => {
    const { fetch } = mockFetch(() => ({ body: { status: "success", data: {} } }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    await expect(pay.refund("missing")).rejects.toMatchObject({
      name: "PayKitError",
      code: "provider_error",
      provider: "flutterwave",
    });
  });
});

describe("flutterwave: transfer", () => {
  it("sends the payout inline and converts subunits to major units", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: "success",
        data: { id: 285959, reference: "trf_1", status: "NEW", amount: 5000 },
      },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.transfer({
      amount: 500000,
      reference: "trf_1",
      reason: "payout",
      recipient: { accountNumber: "0690000040", bankCode: "044" },
    });

    expect(res.status).toBe("pending"); // NEW -> pending
    expect(res.reference).toBe("trf_1");
    expect(res.transferId).toBe("285959");

    expect(calls[0]!.url).toContain("/v3/transfers");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.account_bank).toBe("044");
    expect(sent.account_number).toBe("0690000040");
    expect(sent.amount).toBe(5000); // 500000 kobo -> 5000 naira
    expect(sent.narration).toBe("payout");
  });

  it("maps a successful transfer", async () => {
    const { fetch } = mockFetch(() => ({
      body: { status: "success", data: { id: 1, status: "SUCCESSFUL", amount: 100 } },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.transfer({
      amount: 10000,
      recipient: { accountNumber: "0690000040", bankCode: "044" },
    });
    expect(res.status).toBe("success");
    expect(res.amount).toBe(10000);
  });
});

describe("flutterwave: webhooks", () => {
  const raw = JSON.stringify({
    event: "charge.completed",
    data: { tx_ref: "tx_1", status: "successful", amount: 5000, currency: "NGN" },
  });

  it("accepts a matching verif-hash and normalizes the event", () => {
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, webhookSecret: HASH });
    const event = pay.webhooks.construct(raw, HASH);
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("tx_1");
    expect(event.amount).toBe(500000);
  });

  it("rejects a wrong verif-hash", () => {
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, webhookSecret: HASH });
    try {
      pay.webhooks.construct(raw, "wrong-hash");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PayKitError);
      expect((err as PayKitError).code).toBe("invalid_signature");
    }
  });

  it("errors clearly when webhookSecret is not configured", () => {
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET });
    try {
      pay.webhooks.construct(raw, HASH);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as PayKitError).code).toBe("config_error");
    }
  });
});
