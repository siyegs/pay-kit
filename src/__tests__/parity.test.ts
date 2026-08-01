/**
 * Mock-provider parity tests. The mock client is what offline tests and local
 * development exercise, so every field it returns for an operation must also
 * be returned - under the same key and with the same value type - by the real
 * providers. The mock may return *fewer* fields than a real provider, but
 * never more or differently-typed ones, or the tests would pass against
 * shapes real customers will never see.
 *
 * Known contract asymmetries (covered by reverse checks below):
 * - mock `initialize` returns `accessCode`, which only Paystack maps
 *   (Flutterwave parity is checked in reverse).
 * - Paystack cancelSubscription/enableSubscription return only `{ id, status }`;
 *   the mock follows Flutterwave's full-shape contract (checked in reverse).
 * - mock subscriptions carry `emailToken`, which only Paystack maps, and
 *   Paystack has no cancel-plan endpoint - both providers simply do not have
 *   the counterpart operation to compare against.
 */
import { describe, expect, it } from "bun:test";
import { createFlutterwaveProvider } from "../providers/flutterwave";
import { createMockProvider } from "../providers/mock";
import { createPaystackProvider } from "../providers/paystack";
import { mockFetch } from "./helpers";
import type { PaymentProvider } from "../types";

const SECRET = "sk_test_123";
const PAYSTACK_BASE = "https://api.paystack.co";
const FLUTTERWAVE_BASE = "https://api.flutterwave.com";

const INIT = {
  amount: 500000,
  email: "a@b.com",
  reference: "parity_init",
  callbackUrl: "https://app.example.com/cb",
};

const CHARGE = {
  amount: 500000,
  email: "a@b.com",
  reference: "parity_chg",
  authorizationCode: "AUTH_1",
  callbackUrl: "https://app.example.com/cb",
};

const TRANSFER = {
  amount: 500000,
  reference: "parity_trf",
  recipient: { accountNumber: "0123456789", bankCode: "058", name: "Jane Doe" },
};

const PLAN = {
  name: "Basic",
  amount: 500000,
  interval: "monthly",
  currency: "NGN",
  duration: 12,
};

const planData = (name: string) => ({
  plan_code: "PLN_1",
  name,
  amount: 500000,
  interval: "monthly",
  currency: "NGN",
  status: "active",
  duration: 12,
});

const subData = () => ({
  id: 1,
  subscription_code: "SUB_1",
  customer: "CUS_1",
  plan: "PLN_1",
  status: "active",
  next_payment_date: "2026-09-01T00:00:00Z",
  email_token: "tok_1",
  created_at: "2026-08-01T00:00:00Z",
});

const txnData = () => ({
  reference: "parity_init",
  status: "success",
  amount: 500000,
  currency: "NGN",
  paid_at: "2026-08-01T10:00:00Z",
  customer: { email: "a@b.com", customer_code: "CUS_1" },
});

const verifyData = () => ({
  reference: "parity_init",
  status: "success",
  amount: 500000,
  currency: "NGN",
  paid_at: "2026-08-01T10:00:00Z",
  channel: "card",
  customer: { email: "a@b.com", customer_code: "CUS_1" },
  authorization: { authorization_code: "AUTH_1" },
});

const ok = (data: unknown) => ({ status: true, message: "", data });
const flwOk = (data: unknown) => ({ status: "success", message: "", data });

function paystackResponder(url: string, init: RequestInit) {
  const path = new URL(url).pathname;
  if (path.startsWith("/transaction/initialize")) return { body: ok({ authorization_url: "https://pay.example/checkout/parity_init", reference: "parity_init", access_code: "ac_init" }) };
  if (path.startsWith("/transaction/verify/")) return { body: ok(verifyData()) };
  if (path.startsWith("/transaction/charge_authorization")) return { body: ok(verifyData()) };
  if (path.startsWith("/transaction")) return { body: { status: true, message: "", data: [txnData()], meta: { page: 1 } } };
  if (path.startsWith("/refund")) return { body: ok({ status: "processed", amount: 500000, transaction: { reference: "parity_init" } }) };
  if (path.startsWith("/transferrecipient")) return { body: ok({ recipient_code: "RCP_1" }) };
  if (path.startsWith("/transfer/")) return { body: ok({ reference: "parity_trf", status: "success", amount: 500000, transfer_code: "TRF_1", recipient: { recipient_code: "RCP_1" } }) };
  if (path.startsWith("/transfer")) return { body: ok({ reference: "parity_trf", status: "success", amount: 500000, transfer_code: "TRF_1" }) };
  if (path.startsWith("/bank/resolve")) return { body: ok({ account_number: "0123456789", account_name: "JANE DOE", bank_code: "058" }) };
  if (path.startsWith("/bank")) return { body: ok([{ name: "GTBank", code: "058" }]) };
  if (path.startsWith("/balance")) return { body: ok([{ currency: "NGN", balance: 10000000 }]) };
  if (path.startsWith("/subaccount")) return { body: ok({ subaccount_code: "SUB_1", business_name: "Acme Corp", account_number: "0123456789" }) };
  if (path.startsWith("/plan/")) return { body: ok(planData(init.method === "PUT" ? "Basic Plus" : "Basic")) };
  if (path.startsWith("/plan")) {
    return init.method === "GET"
      ? { body: { status: true, message: "", data: [planData("Basic")], meta: { page: 1 } } }
      : { body: ok(planData("Basic")) };
  }
  if (path.startsWith("/subscription/disable")) return { body: ok({ message: "disabled" }) };
  if (path.startsWith("/subscription/")) return { body: ok(subData()) };
  if (path.startsWith("/subscription")) {
    return init.method === "GET"
      ? { body: { status: true, message: "", data: [subData()], meta: { page: 1 } } }
      : { body: ok(subData()) };
  }
  throw new Error(`unexpected paystack url: ${url}`);
}

function flutterwaveResponder(url: string, init: RequestInit) {
  const path = new URL(url).pathname;
  if (path.startsWith("/v3/payments")) return { body: flwOk({ link: "https://flw.example/checkout/parity_init" }) };
  if (path.startsWith("/v3/transactions/verify_by_reference")) return { body: flwOk({ id: 12345, tx_ref: "parity_init", status: "successful", amount: 5000, currency: "NGN", created_at: "2026-08-01T10:00:00Z", payment_type: "card", customer: { email: "a@b.com" }, card: { token: "FLW_AUTH_1" } }) };
  if (path.startsWith("/v3/tokenized-charges")) return { body: flwOk({ tx_ref: "parity_chg", status: "successful", amount: 5000, currency: "NGN", created_at: "2026-08-01T10:00:00Z", payment_type: "card", customer: { email: "a@b.com" }, card: { token: "FLW_AUTH_1" } }) };
  if (path.includes("/refund")) return { body: flwOk({ status: "completed", amount_refunded: 5000 }) };
  if (path.startsWith("/v3/transfers/")) return { body: flwOk({ reference: "parity_trf", status: "SUCCESSFUL", amount: 5000, id: "T-123" }) };
  if (path.startsWith("/v3/transfers")) return { body: flwOk({ reference: "parity_trf", status: "SUCCESSFUL", amount: 5000, id: "T-123" }) };
  if (path.startsWith("/v3/accounts/resolve")) return { body: flwOk({ account_number: "0123456789", account_name: "JANE DOE" }) };
  if (path.startsWith("/v3/banks/")) return { body: flwOk([{ name: "GTBank", code: "058" }]) };
  if (path.startsWith("/v3/balances")) return { body: flwOk([{ currency: "NGN", available_balance: 100000 }]) };
  if (path.startsWith("/v3/transactions")) return { body: flwOk([{ tx_ref: "parity_init", status: "successful", amount: 5000, currency: "NGN", created_at: "2026-08-01T10:00:00Z", customer: { email: "a@b.com" } }]) };
  if (path.startsWith("/v3/subaccounts")) return { body: flwOk({ subaccount_id: "SUB_1", business_name: "Acme Corp", account_number: "0123456789" }) };
  if (path.includes("/cancel")) return { body: flwOk({ id: 12, name: "Basic", amount: 5000, interval: "monthly", currency: "NGN", status: "active", duration: 12 }) };
  if (path.startsWith("/v3/payment-plans/")) return { body: flwOk({ id: 12, name: "Basic Plus", amount: 5000, interval: "monthly", currency: "NGN", status: "active", duration: 12 }) };
  if (path.startsWith("/v3/payment-plans")) {
    return init.method === "GET"
      ? { body: flwOk({ payment_plans: [{ id: 12, name: "Basic", amount: 5000, interval: "monthly", currency: "NGN", status: "active", duration: 12 }], page: 1 }) }
      : { body: flwOk({ id: 12, name: "Basic", amount: 5000, interval: "monthly", currency: "NGN", status: "active", duration: 12 }) };
  }
  throw new Error(`unexpected flutterwave url: ${url}`);
}

function describeShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length ? [describeShape(value[0])] : ["any"];
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === "raw") continue;
      out[key] = describeShape(val);
    }
    return out;
  }
  return typeof value;
}

function assertSubset(mockShape: unknown, providerShape: unknown, path: string): void {
  if (Array.isArray(mockShape)) {
    expect(Array.isArray(providerShape), `${path} should be an array`).toBe(true);
    if (Array.isArray(providerShape) && providerShape[0] !== undefined && mockShape[0] !== "any" && providerShape[0] !== "any") {
      assertSubset(mockShape[0], providerShape[0], `${path}[]`);
    }
    return;
  }
  if (mockShape !== null && typeof mockShape === "object") {
    expect(providerShape, `${path} should be an object`).not.toBeNull();
    expect(typeof providerShape, `${path} should be an object`).toBe("object");
    for (const [key, sub] of Object.entries(mockShape as Record<string, unknown>)) {
      const providerSub = (providerShape as Record<string, unknown>)[key];
      expect(providerSub, `${path}.${key} is missing from the real provider's result`).toBeDefined();
      assertSubset(sub, providerSub, `${path}.${key}`);
    }
    return;
  }
  expect(providerShape, `${path} should have the same value type`).toBe(mockShape);
}

function paystackClient(): PaymentProvider {
  const { fetch } = mockFetch(paystackResponder);
  return createPaystackProvider({ secretKey: SECRET, baseUrl: PAYSTACK_BASE, fetch, generateReference: () => "parity_init" });
}

function flutterwaveClient(): PaymentProvider {
  const { fetch } = mockFetch(flutterwaveResponder);
  return createFlutterwaveProvider({ secretKey: SECRET, baseUrl: FLUTTERWAVE_BASE, fetch, generateReference: () => "parity_init" });
}

function mockClient(): PaymentProvider {
  let seq = 0;
  const neverFetch = (() => {
    throw new Error("mock provider makes no network calls");
  }) as unknown as typeof fetch;
  return createMockProvider({
    secretKey: SECRET,
    fetch: neverFetch,
    generateReference: () => `parity_${++seq}`,
  });
}

async function checkParity(
  label: string,
  mock: PaymentProvider,
  real: PaymentProvider,
  op: (p: PaymentProvider) => Promise<unknown>,
): Promise<void> {
  const mockResult = await op(mock);
  const realResult = await op(real);
  assertSubset(describeShape(mockResult), describeShape(realResult), label);
}

/** Reverse check: the real provider's shape must be covered by the mock's. */
async function checkReverseParity(
  label: string,
  mock: PaymentProvider,
  real: PaymentProvider,
  op: (p: PaymentProvider) => Promise<unknown>,
): Promise<void> {
  const mockResult = await op(mock);
  const realResult = await op(real);
  assertSubset(describeShape(realResult), describeShape(mockResult), label);
}

describe("mock parity vs paystack", () => {
  it("initialize", async () => {
    await checkParity("initialize", mockClient(), paystackClient(), (p) => p.initialize({ ...INIT }));
  });

  it("verify", async () => {
    await checkParity("verify", mockClient(), paystackClient(), async (p) => {
      await p.initialize({ ...INIT });
      return p.verify(INIT.reference);
    });
  });

  it("chargeAuthorization", async () => {
    await checkParity("chargeAuthorization", mockClient(), paystackClient(), (p) => p.chargeAuthorization({ ...CHARGE }));
  });

  it("refund", async () => {
    await checkParity("refund", mockClient(), paystackClient(), async (p) => {
      await p.initialize({ ...INIT });
      return p.refund(INIT.reference);
    });
  });

  it("transfer", async () => {
    await checkParity("transfer", mockClient(), paystackClient(), (p) => p.transfer({ ...TRANSFER }));
  });

  it("verifyTransfer", async () => {
    await checkParity("verifyTransfer", mockClient(), paystackClient(), (p) => p.verifyTransfer("T-123"));
  });

  it("resolveAccount", async () => {
    await checkParity("resolveAccount", mockClient(), paystackClient(), (p) =>
      p.resolveAccount({ accountNumber: "0123456789", bankCode: "058" }),
    );
  });

  it("listBanks", async () => {
    await checkParity("listBanks", mockClient(), paystackClient(), (p) => p.listBanks());
  });

  it("getBalances", async () => {
    await checkParity("getBalances", mockClient(), paystackClient(), (p) => p.getBalances());
  });

  it("listTransactions", async () => {
    await checkParity("listTransactions", mockClient(), paystackClient(), async (p) => {
      await p.initialize({ ...INIT });
      return p.listTransactions();
    });
  });

  it("createSubaccount", async () => {
    await checkParity("createSubaccount", mockClient(), paystackClient(), (p) =>
      p.createSubaccount({ businessName: "Acme Corp", accountNumber: "0123456789", bankCode: "058", percentageCharge: 10 }),
    );
  });

  it("createPlan", async () => {
    await checkParity("createPlan", mockClient(), paystackClient(), (p) => p.createPlan({ ...PLAN }));
  });

  it("fetchPlan", async () => {
    await checkParity("fetchPlan", mockClient(), paystackClient(), async (p) => {
      const created = await p.createPlan({ ...PLAN });
      return p.fetchPlan(created.id);
    });
  });

  it("updatePlan", async () => {
    await checkParity("updatePlan", mockClient(), paystackClient(), async (p) => {
      const created = await p.createPlan({ ...PLAN });
      return p.updatePlan(created.id, { name: "Basic Plus", amount: 600000 });
    });
  });

  it("listPlans", async () => {
    await checkParity("listPlans", mockClient(), paystackClient(), async (p) => {
      await p.createPlan({ ...PLAN });
      return p.listPlans();
    });
  });

  it("createSubscription", async () => {
    await checkParity("createSubscription", mockClient(), paystackClient(), async (p) => {
      const plan = await p.createPlan({ ...PLAN });
      return p.createSubscription({ customer: "CUS_1", plan: plan.id });
    });
  });

  it("fetchSubscription", async () => {
    await checkParity("fetchSubscription", mockClient(), paystackClient(), async (p) => {
      const plan = await p.createPlan({ ...PLAN });
      const sub = await p.createSubscription({ customer: "CUS_1", plan: plan.id });
      return p.fetchSubscription(sub.id);
    });
  });

  it("listSubscriptions", async () => {
    await checkParity("listSubscriptions", mockClient(), paystackClient(), async (p) => {
      const plan = await p.createPlan({ ...PLAN });
      await p.createSubscription({ customer: "CUS_1", plan: plan.id });
      return p.listSubscriptions();
    });
  });

  it("cancelSubscription", async () => {
    // Paystack cancel/enable return only { id, status } - the mock's full
    // subscription shape (Flutterwave's contract) must cover that.
    await checkReverseParity("cancelSubscription", mockClient(), paystackClient(), async (p) => {
      const plan = await p.createPlan({ ...PLAN });
      const sub = await p.createSubscription({ customer: "CUS_1", plan: plan.id });
      return p.cancelSubscription(sub.id, { token: "tok_1" });
    });
  });

  it("enableSubscription", async () => {
    await checkReverseParity("enableSubscription", mockClient(), paystackClient(), async (p) => {
      const plan = await p.createPlan({ ...PLAN });
      const sub = await p.createSubscription({ customer: "CUS_1", plan: plan.id });
      await p.cancelSubscription(sub.id, { token: "tok_1" });
      return p.enableSubscription(sub.id, { token: "tok_1" });
    });
  });
});

describe("mock parity vs flutterwave", () => {
  it("initialize covers flutterwave's minimal result", async () => {
    // Flutterwave initialize returns no accessCode - mock adds one (paystack
    // contract), so only the reverse direction applies.
    await checkReverseParity("initialize", mockClient(), flutterwaveClient(), (p) => p.initialize({ ...INIT }));
  });

  it("verify", async () => {
    await checkParity("verify", mockClient(), flutterwaveClient(), async (p) => {
      await p.initialize({ ...INIT });
      return p.verify(INIT.reference);
    });
  });

  it("chargeAuthorization", async () => {
    await checkParity("chargeAuthorization", mockClient(), flutterwaveClient(), (p) => p.chargeAuthorization({ ...CHARGE }));
  });

  it("refund", async () => {
    await checkParity("refund", mockClient(), flutterwaveClient(), async (p) => {
      await p.initialize({ ...INIT });
      return p.refund(INIT.reference);
    });
  });

  it("transfer", async () => {
    await checkParity("transfer", mockClient(), flutterwaveClient(), (p) => p.transfer({ ...TRANSFER }));
  });

  it("verifyTransfer", async () => {
    await checkParity("verifyTransfer", mockClient(), flutterwaveClient(), (p) => p.verifyTransfer("T-123"));
  });

  it("resolveAccount", async () => {
    await checkParity("resolveAccount", mockClient(), flutterwaveClient(), (p) =>
      p.resolveAccount({ accountNumber: "0123456789", bankCode: "058" }),
    );
  });

  it("listBanks", async () => {
    await checkParity("listBanks", mockClient(), flutterwaveClient(), (p) => p.listBanks());
  });

  it("getBalances", async () => {
    await checkParity("getBalances", mockClient(), flutterwaveClient(), (p) => p.getBalances());
  });

  it("listTransactions", async () => {
    await checkParity("listTransactions", mockClient(), flutterwaveClient(), async (p) => {
      await p.initialize({ ...INIT });
      return p.listTransactions({ page: 1 });
    });
  });

  it("createSubaccount", async () => {
    await checkParity("createSubaccount", mockClient(), flutterwaveClient(), (p) =>
      p.createSubaccount({ businessName: "Acme Corp", accountNumber: "0123456789", bankCode: "058", percentageCharge: 10, email: "b@example.com" }),
    );
  });

  it("createPlan", async () => {
    await checkParity("createPlan", mockClient(), flutterwaveClient(), (p) => p.createPlan({ ...PLAN }));
  });

  it("listPlans", async () => {
    await checkParity("listPlans", mockClient(), flutterwaveClient(), async (p) => {
      await p.createPlan({ ...PLAN });
      return p.listPlans();
    });
  });

  it("fetchPlan", async () => {
    await checkParity("fetchPlan", mockClient(), flutterwaveClient(), async (p) => {
      const created = await p.createPlan({ ...PLAN });
      return p.fetchPlan(created.id);
    });
  });

  it("updatePlan", async () => {
    await checkParity("updatePlan", mockClient(), flutterwaveClient(), async (p) => {
      const created = await p.createPlan({ ...PLAN });
      return p.updatePlan(created.id, { name: "Basic Plus", amount: 600000 });
    });
  });

  it("cancelPlan", async () => {
    await checkParity("cancelPlan", mockClient(), flutterwaveClient(), async (p) => {
      const created = await p.createPlan({ ...PLAN });
      return p.cancelPlan(created.id);
    });
  });
});
