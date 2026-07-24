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

    const res = await pay.initialize({
      amount: 500000,
      email: "a@b.com",
      reference: "tx_1",
      callbackUrl: "https://example.com/callback",
    });

    expect(res.authorizationUrl).toBe("https://checkout.flutterwave.com/xyz");
    expect(res.reference).toBe("tx_1");

    const sent = jsonBody(calls[0]!.init);
    expect(calls[0]!.url).toContain("/v3/payments");
    expect(sent.amount).toBe(5000); // 500000 kobo -> 5000 naira
    expect(sent.tx_ref).toBe("tx_1");
    expect((sent.customer as Record<string, unknown>).email).toBe("a@b.com");
  });
});

describe("flutterwave: initialize requires callbackUrl", () => {
  it("throws a config_error when callbackUrl is missing", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { status: "success", data: { link: "x" } } }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    await expect(pay.initialize({ amount: 1000, email: "a@b.com" })).rejects.toMatchObject({
      name: "PayKitError",
      code: "config_error",
      provider: "flutterwave",
    });
    // It must fail before any network call.
    expect(calls).toHaveLength(0);
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

describe("flutterwave: split", () => {
  it("builds a subaccounts array with a flat charge in major units", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: "success", data: { link: "https://flw/checkout" } },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    await pay.initialize({
      amount: 500000,
      email: "a@b.com",
      callbackUrl: "https://example.com/callback",
      split: { subaccount: "RS_x", transactionCharge: 10000 },
    });

    const sent = jsonBody(calls[0]!.init);
    const subs = sent.subaccounts as Array<Record<string, unknown>>;
    expect(subs[0]!.id).toBe("RS_x");
    expect(subs[0]!.transaction_charge_type).toBe("flat");
    expect(subs[0]!.transaction_charge).toBe(100); // 10000 kobo -> 100 naira
  });
});

describe("flutterwave: chargeAuthorization", () => {
  it("charges a saved card token and converts to major units", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: "success",
        data: {
          tx_ref: "tx_2",
          status: "successful",
          amount: 5000,
          currency: "NGN",
          customer: { email: "a@b.com" },
          card: { token: "flw-token-next" },
        },
      },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.chargeAuthorization({
      authorizationCode: "flw-token-abc",
      email: "a@b.com",
      amount: 500000,
      reference: "tx_2",
    });
    expect(res.status).toBe("success");
    expect(res.amount).toBe(500000); // 5000 naira -> kobo
    expect(res.authorization).toBe("flw-token-next");
    expect(calls[0]!.url).toContain("/v3/tokenized-charges");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.token).toBe("flw-token-abc");
    expect(sent.amount).toBe(5000); // 500000 kobo -> naira
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

describe("flutterwave: verifyTransfer", () => {
  it("fetches a transfer by id and converts amount to subunits", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: "success",
        data: { id: 285959, reference: "trf_1", status: "SUCCESSFUL", amount: 5000 },
      },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.verifyTransfer("285959");
    expect(res.status).toBe("success");
    expect(res.amount).toBe(500000); // 5000 naira -> 500000 kobo
    expect(res.transferId).toBe("285959");
    expect(calls[0]!.url).toContain("/v3/transfers/285959");
  });
});

describe("flutterwave: resolveAccount", () => {
  it("posts account_number + account_bank and returns the name", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: "success", data: { account_number: "0690000040", account_name: "ADA LOVELACE" } },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.resolveAccount({ accountNumber: "0690000040", bankCode: "044" });
    expect(res.accountName).toBe("ADA LOVELACE");
    expect(calls[0]!.url).toContain("/v3/accounts/resolve");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.account_number).toBe("0690000040");
    expect(sent.account_bank).toBe("044");
  });
});

describe("flutterwave: listBanks", () => {
  it("lists banks by country code", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: "success",
        data: [
          { id: 1, name: "Access Bank", code: "044" },
          { id: 2, name: "GTBank", code: "058" },
        ],
      },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const banks = await pay.listBanks({ country: "ng" });
    expect(banks).toEqual([
      { name: "Access Bank", code: "044" },
      { name: "GTBank", code: "058" },
    ]);
    expect(calls[0]!.url).toContain("/v3/banks/NG");
  });
});

describe("flutterwave: getBalances", () => {
  it("converts major-unit balances to subunits", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: "success", data: [{ currency: "NGN", available_balance: 15000 }] },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const balances = await pay.getBalances();
    expect(balances[0]!.currency).toBe("NGN");
    expect(balances[0]!.available).toBe(1500000); // 15000 naira -> kobo
    expect(calls[0]!.url).toContain("/v3/balances");
  });
});

describe("flutterwave: listTransactions", () => {
  it("normalizes rows and converts amounts to subunits", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: "success",
        data: [
          {
            tx_ref: "tx_1",
            status: "successful",
            amount: 5000,
            currency: "NGN",
            created_at: "2026-01-01T00:00:00Z",
            customer: { email: "a@b.com" },
          },
        ],
      },
    }));
    const pay = createPayClient({ provider: "flutterwave", secretKey: SECRET, fetch });

    const res = await pay.listTransactions({ page: 1 });
    expect(res.transactions[0]!.reference).toBe("tx_1");
    expect(res.transactions[0]!.status).toBe("success");
    expect(res.transactions[0]!.amount).toBe(500000); // 5000 naira -> kobo
    expect(calls[0]!.url).toContain("/v3/transactions");
    expect(calls[0]!.url).toContain("page=1");
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
