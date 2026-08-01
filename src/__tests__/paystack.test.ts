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

describe("paystack: split", () => {
  it("passes subaccount, charge, and bearer on initialize", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: true, data: { authorization_url: "u", reference: "r" } },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await pay.initialize({
      amount: 500000,
      email: "a@b.com",
      split: { subaccount: "ACCT_x", transactionCharge: 10000, bearer: "subaccount" },
    });

    const sent = jsonBody(calls[0]!.init);
    expect(sent.subaccount).toBe("ACCT_x");
    expect(sent.transaction_charge).toBe(10000);
    expect(sent.bearer).toBe("subaccount");
  });

  it("omits split fields when no split is given", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: true, data: { authorization_url: "u", reference: "r" } },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });
    await pay.initialize({ amount: 500000, email: "a@b.com" });
    expect(jsonBody(calls[0]!.init).subaccount).toBeUndefined();
  });
});

describe("paystack: chargeAuthorization", () => {
  it("charges a saved authorization code without a redirect", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: {
          reference: "ref_2",
          status: "success",
          amount: 500000,
          currency: "NGN",
          customer: { email: "a@b.com" },
          authorization: { authorization_code: "AUTH_next" },
        },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.chargeAuthorization({
      authorizationCode: "AUTH_abc",
      email: "a@b.com",
      amount: 500000,
      reference: "ref_2",
    });
    expect(res.status).toBe("success");
    expect(res.amount).toBe(500000);
    expect(res.authorization).toBe("AUTH_next");
    expect(calls[0]!.url).toContain("/transaction/charge_authorization");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.authorization_code).toBe("AUTH_abc");
    expect(sent.amount).toBe(500000);
  });
});

describe("paystack: verify exposes a reusable token", () => {
  it("surfaces authorization_code from verify", async () => {
    const { fetch } = mockFetch(() => ({
      body: {
        status: true,
        data: { reference: "ref_1", status: "success", amount: 100, currency: "NGN", authorization: { authorization_code: "AUTH_xyz" } },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });
    expect((await pay.verify("ref_1")).authorization).toBe("AUTH_xyz");
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

describe("paystack: verifyTransfer", () => {
  it("fetches a transfer by id/code and normalizes status + amount", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: {
          status: "success",
          reference: "trf_1",
          amount: 500000,
          transfer_code: "TRF_xyz",
          recipient: { recipient_code: "RCP_abc" },
        },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.verifyTransfer("TRF_xyz");
    expect(res.status).toBe("success");
    expect(res.amount).toBe(500000);
    expect(res.reference).toBe("trf_1");
    expect(res.recipientCode).toBe("RCP_abc");
    expect(calls[0]!.url).toContain("/transfer/TRF_xyz");
  });

  it("maps a still-processing transfer to pending", async () => {
    const { fetch } = mockFetch(() => ({
      body: { status: true, data: { status: "pending", reference: "trf_2" } },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });
    expect((await pay.verifyTransfer("TRF_2")).status).toBe("pending");
  });
});

describe("paystack: resolveAccount", () => {
  it("returns the account name for a number + bank code", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: true, data: { account_number: "0001234567", account_name: "ADA LOVELACE" } },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.resolveAccount({ accountNumber: "0001234567", bankCode: "058" });
    expect(res.accountName).toBe("ADA LOVELACE");
    expect(res.accountNumber).toBe("0001234567");
    expect(res.bankCode).toBe("058");
    expect(calls[0]!.url).toContain("/bank/resolve?");
    expect(calls[0]!.url).toContain("account_number=0001234567");
    expect(calls[0]!.url).toContain("bank_code=058");
  });
});

describe("paystack: listBanks", () => {
  it("lists banks by currency derived from country", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: [
          { name: "Access Bank", code: "044", extra: "ignored" },
          { name: "GTBank", code: "058" },
        ],
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const banks = await pay.listBanks({ country: "GH" });
    expect(banks).toEqual([
      { name: "Access Bank", code: "044" },
      { name: "GTBank", code: "058" },
    ]);
    expect(calls[0]!.url).toContain("/bank?currency=GHS");
  });

  it("defaults to NGN when no country is given", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { status: true, data: [] } }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await pay.listBanks();
    expect(calls[0]!.url).toContain("currency=NGN");
  });
});

describe("paystack: getBalances", () => {
  it("returns balances in subunits per currency", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: true, data: [{ currency: "NGN", balance: 1500000 }] },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const balances = await pay.getBalances();
    expect(balances).toEqual([{ currency: "NGN", available: 1500000, raw: { currency: "NGN", balance: 1500000 } }]);
    expect(calls[0]!.url).toContain("/balance");
  });
});

describe("paystack: listTransactions", () => {
  it("normalizes rows and passes pagination params", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: [
          {
            reference: "ref_1",
            status: "success",
            amount: 500000,
            currency: "NGN",
            paid_at: "2026-01-01T00:00:00Z",
            customer: { email: "a@b.com" },
          },
        ],
        meta: { page: 2 },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const res = await pay.listTransactions({ page: 2, perPage: 25 });
    expect(res.page).toBe(2);
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0]!.reference).toBe("ref_1");
    expect(res.transactions[0]!.amount).toBe(500000);
    expect(res.transactions[0]!.customer?.email).toBe("a@b.com");
    expect(calls[0]!.url).toContain("perPage=25");
    expect(calls[0]!.url).toContain("page=2");
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

describe("paystack: createSubaccount", () => {
  it("posts business/bank/account/percentage and returns the subaccount code", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: { subaccount_code: "ACCT_new", business_name: "Vendor A", account_number: "0001112223" },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const sub = await pay.createSubaccount({
      businessName: "Vendor A",
      bankCode: "058",
      accountNumber: "0001112223",
      percentageCharge: 20,
    });

    expect(sub.id).toBe("ACCT_new");
    expect(calls[0]!.url).toContain("/subaccount");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.business_name).toBe("Vendor A");
    expect(sent.settlement_bank).toBe("058");
    expect(sent.account_number).toBe("0001112223");
    expect(sent.percentage_charge).toBe(20);
  });
});

describe("paystack: plans", () => {
  const planResponse = {
    status: true,
    data: {
      plan_code: "PLN_abc123",
      name: "Pro Monthly",
      amount: 500000,
      interval: "monthly",
      currency: "NGN",
      status: "active",
    },
  };

  it("creates a plan with the canonical interval mapped (yearly -> annually)", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: planResponse }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const plan = await pay.createPlan({
      name: "Pro Monthly",
      amount: 500000,
      interval: "yearly",
      currency: "NGN",
    });

    expect(plan.id).toBe("PLN_abc123");
    expect(plan.amount).toBe(500000);
    expect(plan.interval).toBe("monthly");
    expect(calls[0]!.url).toContain("/plan");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.name).toBe("Pro Monthly");
    expect(sent.amount).toBe(500000);
    expect(sent.interval).toBe("annually");
    expect(sent.currency).toBe("NGN");
  });

  it("requires an amount for Paystack plans (subunits, no dynamic pricing)", async () => {
    const { fetch } = mockFetch(() => ({ body: planResponse }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await expect(
      pay.createPlan({ name: "Pro", interval: "monthly" }),
    ).rejects.toMatchObject({ code: "config_error" });
  });

  it("lists plans with pagination and status filters", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: true, data: [planResponse.data], meta: { total: 1 } },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const list = await pay.listPlans({ page: 2, perPage: 10, status: "active", currency: "NGN" });
    expect(list.plans).toHaveLength(1);
    expect(list.plans[0]!.id).toBe("PLN_abc123");
    const url = calls[0]!.url;
    expect(url).toContain("/plan");
    expect(url).toContain("page=2");
    expect(url).toContain("perPage=10");
    expect(url).toContain("status=active");
    expect(url).toContain("currency=NGN");
  });

  it("fetches and updates a plan by code", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: planResponse }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const fetched = await pay.fetchPlan("PLN_abc123");
    expect(fetched.id).toBe("PLN_abc123");
    expect(calls[0]!.url).toContain("/plan/PLN_abc123");

    const updated = await pay.updatePlan("PLN_abc123", { name: "Pro Yearly", amount: 5000000 });
    expect(updated.name).toBe("Pro Monthly");
    const sent = jsonBody(calls[1]!.init);
    expect(sent.name).toBe("Pro Yearly");
    expect(sent.amount).toBe(5000000);
    expect(calls[1]!.init.method).toBe("PUT");
  });

  it("cannot cancel a Paystack plan - no endpoint exists", async () => {
    const { fetch } = mockFetch(() => ({ body: planResponse }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await expect(pay.cancelPlan("PLN_abc123")).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("paystack: subscriptions", () => {
  const subResponse = {
    status: true,
    data: {
      subscription_code: "SUB_xyz789",
      customer: { customer_code: "CUS_1", email: "a@b.com" },
      plan: { plan_code: "PLN_abc123" },
      status: "active",
      email_token: "tok_1",
      next_payment_date: "2026-09-01T00:00:00.000Z",
    },
  };

  it("creates a subscription from customer/plan/authorization", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: subResponse }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const sub = await pay.createSubscription({
      customer: "CUS_1",
      plan: "PLN_abc123",
      authorization: "AUTH_1",
    });

    expect(sub.id).toBe("SUB_xyz789");
    expect(sub.emailToken).toBe("tok_1");
    expect(sub.status).toBe("active");
    expect(calls[0]!.url).toContain("/subscription");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.customer).toBe("CUS_1");
    expect(sent.plan).toBe("PLN_abc123");
    expect(sent.authorization).toBe("AUTH_1");
  });

  it("lists and fetches subscriptions", async () => {
    let list = true;
    const { fetch, calls } = mockFetch(() => ({
      body: { status: true, data: list ? [subResponse.data] : subResponse.data },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const result = await pay.listSubscriptions({ perPage: 5 });
    expect(result.subscriptions).toHaveLength(1);
    expect(calls[0]!.url).toContain("/subscription");
    expect(calls[0]!.url).toContain("perPage=5");

    list = false;
    const fetched = await pay.fetchSubscription("SUB_xyz789");
    expect(fetched.id).toBe("SUB_xyz789");
    expect(calls[1]!.url).toContain("/subscription/SUB_xyz789");
  });

  it("cancels (disables) a subscription with code + email token", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: subResponse }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    const sub = await pay.cancelSubscription("SUB_xyz789", { token: "tok_1" });
    expect(sub.status).toBe("cancelled");
    expect(sub.id).toBe("SUB_xyz789");
    expect(calls[0]!.url).toContain("/subscription/disable");
    const sent = jsonBody(calls[0]!.init);
    expect(sent.code).toBe("SUB_xyz789");
    expect(sent.token).toBe("tok_1");
  });

  it("rejects cancel/enable without the email token", async () => {
    const { fetch } = mockFetch(() => ({ body: subResponse }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await expect(pay.cancelSubscription("SUB_xyz789")).rejects.toMatchObject({
      code: "config_error",
    });
    await expect(pay.enableSubscription("SUB_xyz789")).rejects.toMatchObject({
      code: "config_error",
    });
  });

  it("re-enables (enables) a subscription with code + email token", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: subResponse }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await pay.enableSubscription("SUB_xyz789", { token: "tok_1" });
    expect(calls[0]!.url).toContain("/subscription/enable");
  });
});

describe("paystack: initialize with a plan", () => {
  it("posts the plan code so Paystack starts the subscription flow", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        status: true,
        data: { authorization_url: "https://pay.example/checkout", reference: "ref_plan" },
      },
    }));
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET, fetch });

    await pay.initialize({ amount: 500000, email: "a@b.com", plan: "PLN_abc123" });

    const sent = jsonBody(calls[0]!.init);
    expect(sent.plan).toBe("PLN_abc123");
    expect(sent.amount).toBe(500000);
  });
});

describe("config", () => {
  it("throws when secretKey is missing", () => {
    expect(() => createPayClient({ provider: "paystack", secretKey: "" })).toThrow(PayKitError);
  });
});
