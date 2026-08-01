import { PayKitError } from "../errors";
import type {
  Bank,
  ChargeAuthorizationParams,
  CreatePlanParams,
  CreateSubaccountParams,
  CreateSubscriptionParams,
  InitializeParams,
  InitializeResult,
  ListBanksOptions,
  ListPlansOptions,
  ListSubscriptionsOptions,
  ListTransactionsOptions,
  PaymentProvider,
  PaymentStatus,
  Plan,
  PlanList,
  ProviderBalance,
  ProviderContext,
  RefundOptions,
  RefundResult,
  ResolveAccountParams,
  ResolvedAccount,
  Subaccount,
  Subscription,
  SubscriptionList,
  TransactionList,
  TransferParams,
  TransferResult,
  UpdatePlanParams,
  VerifyResult,
  WebhookEvent,
  WebhookEventType,
} from "../types";

/**
 * In-memory mock provider. Needs no API keys and makes no network calls, so you
 * can exercise a full payment flow (initialize -> verify -> refund, transfer,
 * account resolution, webhooks) in local development and tests.
 *
 * It is stateful per client: a charge you `initialize` is remembered, so a later
 * `verify` echoes the same amount, currency, and customer. Each `createPayClient`
 * gets its own isolated store.
 */

const MOCK_BANKS: Bank[] = [
  { name: "Mock Bank", code: "001" },
  { name: "Test Microfinance Bank", code: "002" },
  { name: "Sandbox Savings & Trust", code: "003" },
];

interface StoredCharge {
  reference: string;
  amount: number;
  currency: string;
  email: string;
  status: PaymentStatus;
  authorization: string;
}

export function createMockProvider(ctx: ProviderContext): PaymentProvider {
  const charges = new Map<string, StoredCharge>();
  const transfers = new Map<string, TransferResult>();
  const plans = new Map<string, Plan>();
  const subscriptions = new Map<string, Subscription>();
  let planSeq = 0;
  let subSeq = 0;

  function requirePlan(idOrCode: string): Plan {
    const plan = plans.get(idOrCode);
    if (!plan) {
      throw new PayKitError(`Mock plan "${idOrCode}" not found - create it first`, {
        code: "provider_error",
        provider: "mock",
      });
    }
    return plan;
  }

  function requireSubscription(idOrCode: string): Subscription {
    const sub = subscriptions.get(idOrCode);
    if (!sub) {
      throw new PayKitError(`Mock subscription "${idOrCode}" not found`, {
        code: "provider_error",
        provider: "mock",
      });
    }
    return sub;
  }

  return {
    name: "mock",

    async initialize(params: InitializeParams): Promise<InitializeResult> {
      const reference = params.reference ?? ctx.generateReference();
      const currency = params.currency ?? "NGN";
      // Mock charges "succeed" - a later verify returns success.
      charges.set(reference, {
        reference,
        amount: params.amount,
        currency,
        email: params.email,
        status: "success",
        authorization: `mock_auth_${reference}`,
      });
      return {
        reference,
        authorizationUrl: `https://mock.pay-kit.dev/checkout/${reference}`,
        accessCode: `mock_ac_${reference}`,
        raw: { mock: true, reference, amount: params.amount, currency },
      };
    },

    async verify(reference: string): Promise<VerifyResult> {
      const charge = charges.get(reference);
      if (!charge) {
        // Unknown reference behaves like a never-completed charge.
        return {
          reference,
          status: "abandoned",
          amount: 0,
          currency: "NGN",
          raw: { mock: true, found: false },
        };
      }
      return {
        reference,
        status: charge.status,
        amount: charge.amount,
        currency: charge.currency,
        channel: "mock",
        customer: { email: charge.email },
        authorization: charge.authorization,
        raw: { mock: true, ...charge },
      };
    },

    async chargeAuthorization(params: ChargeAuthorizationParams): Promise<VerifyResult> {
      const reference = params.reference ?? ctx.generateReference();
      const currency = params.currency ?? "NGN";
      charges.set(reference, {
        reference,
        amount: params.amount,
        currency,
        email: params.email,
        status: "success",
        authorization: params.authorizationCode,
      });
      return {
        reference,
        status: "success",
        amount: params.amount,
        currency,
        channel: "mock",
        customer: { email: params.email },
        authorization: params.authorizationCode,
        raw: { mock: true, reused: params.authorizationCode },
      };
    },

    async refund(reference: string, options?: RefundOptions): Promise<RefundResult> {
      const amount = options?.amount ?? charges.get(reference)?.amount;
      return {
        reference,
        status: "processed",
        amount,
        raw: { mock: true, refunded: amount ?? null },
      };
    },

    async transfer(params: TransferParams): Promise<TransferResult> {
      const reference = params.reference ?? ctx.generateReference();
      const transferId = `mock_trf_${reference}`;
      const result: TransferResult = {
        reference,
        status: "success",
        amount: params.amount,
        transferId,
        raw: { mock: true, reference, recipient: params.recipient },
      };
      transfers.set(transferId, result);
      return result;
    },

    async verifyTransfer(transferId: string): Promise<TransferResult> {
      const stored = transfers.get(transferId);
      if (stored) return stored;
      // Unknown id verifies as pending - the payout was never seen here.
      return { reference: transferId, status: "pending", transferId, raw: { mock: true, found: false } };
    },

    async resolveAccount(params: ResolveAccountParams): Promise<ResolvedAccount> {
      return {
        accountNumber: params.accountNumber,
        accountName: "MOCK ACCOUNT HOLDER",
        bankCode: params.bankCode,
        raw: { mock: true },
      };
    },

    async listBanks(_options?: ListBanksOptions): Promise<Bank[]> {
      return MOCK_BANKS.map((bank) => ({ ...bank }));
    },

    async getBalances(): Promise<ProviderBalance[]> {
      return [{ currency: "NGN", available: 100_000_00, raw: { mock: true } }];
    },

    async listTransactions(_options?: ListTransactionsOptions): Promise<TransactionList> {
      // Echo back the charges this mock client has initialized.
      const transactions = [...charges.values()].map((charge) => ({
        reference: charge.reference,
        status: charge.status,
        amount: charge.amount,
        currency: charge.currency,
        customer: { email: charge.email },
        raw: { mock: true, ...charge },
      }));
      return { transactions, page: 1, raw: { mock: true } };
    },

    async createSubaccount(params: CreateSubaccountParams): Promise<Subaccount> {
      return {
        id: `mock_sub_${ctx.generateReference()}`,
        businessName: params.businessName,
        accountNumber: params.accountNumber,
        bankCode: params.bankCode,
        raw: { mock: true, params },
      };
    },

    async createPlan(params: CreatePlanParams): Promise<Plan> {
      const plan: Plan = {
        id: `mock_plan_${++planSeq}`,
        name: params.name,
        amount: params.amount,
        interval: params.interval,
        currency: params.currency ?? "NGN",
        status: "active",
        duration: params.duration,
        raw: { mock: true },
      };
      plans.set(plan.id, plan);
      return plan;
    },

    async listPlans(_options?: ListPlansOptions): Promise<PlanList> {
      return { plans: [...plans.values()], page: 1, raw: { mock: true } };
    },

    async fetchPlan(idOrCode: string): Promise<Plan> {
      return requirePlan(idOrCode);
    },

    async updatePlan(idOrCode: string, params: UpdatePlanParams): Promise<Plan> {
      const plan = requirePlan(idOrCode);
      const next: Plan = {
        ...plan,
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.amount !== undefined ? { amount: params.amount } : {}),
        ...(params.interval !== undefined ? { interval: params.interval } : {}),
        ...(params.currency !== undefined ? { currency: params.currency } : {}),
        ...(params.duration !== undefined ? { duration: params.duration } : {}),
        raw: { mock: true },
      };
      plans.set(idOrCode, next);
      return next;
    },

    async cancelPlan(idOrCode: string): Promise<Plan> {
      const plan = requirePlan(idOrCode);
      const next: Plan = { ...plan, status: "cancelled", raw: { mock: true } };
      plans.set(idOrCode, next);
      return next;
    },

    async createSubscription(params: CreateSubscriptionParams): Promise<Subscription> {
      requirePlan(params.plan);
      const sub: Subscription = {
        id: `mock_sub_${++subSeq}`,
        customer: params.customer,
        plan: params.plan,
        status: "active",
        emailToken: `mock_tok_${subSeq}`,
        createdAt: new Date().toISOString(),
        raw: { mock: true },
      };
      subscriptions.set(sub.id, sub);
      return sub;
    },

    async listSubscriptions(_options?: ListSubscriptionsOptions): Promise<SubscriptionList> {
      return { subscriptions: [...subscriptions.values()], page: 1, raw: { mock: true } };
    },

    async fetchSubscription(idOrCode: string): Promise<Subscription> {
      return requireSubscription(idOrCode);
    },

    async cancelSubscription(idOrCode: string): Promise<Subscription> {
      const sub = requireSubscription(idOrCode);
      const next: Subscription = { ...sub, status: "cancelled", raw: { mock: true } };
      subscriptions.set(idOrCode, next);
      return next;
    },

    async enableSubscription(idOrCode: string): Promise<Subscription> {
      const sub = requireSubscription(idOrCode);
      const next: Subscription = { ...sub, status: "active", raw: { mock: true } };
      subscriptions.set(idOrCode, next);
      return next;
    },

    constructWebhookEvent(rawBody: string, signature: string): WebhookEvent {
      // No real crypto - the mock just requires a non-empty signature so tests
      // can exercise both the accept and reject paths of a webhook handler.
      if (!signature) {
        throw new PayKitError("Missing mock webhook signature", {
          code: "invalid_signature",
          provider: "mock",
        });
      }

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(rawBody) as Record<string, unknown>;
      } catch (err) {
        throw new PayKitError("Malformed mock webhook body", {
          code: "provider_error",
          provider: "mock",
          cause: err,
        });
      }

      const data = (event.data ?? {}) as Record<string, unknown>;
      return {
        type: (typeof event.event === "string" ? event.event : "unknown") as WebhookEventType,
        reference: String(data.reference ?? ""),
        status: data.status ? (String(data.status) as PaymentStatus) : undefined,
        amount: data.amount !== undefined ? Number(data.amount) : undefined,
        currency: data.currency ? String(data.currency) : undefined,
        raw: event,
      };
    },
  };
}
