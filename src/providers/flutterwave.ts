import { PayKitError } from "../errors";
import { providerRequest, safeEqual } from "../internal";
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
  RefundStatus,
  ResolveAccountParams,
  ResolvedAccount,
  Subaccount,
  Subscription,
  SubscriptionList,
  TransactionList,
  TransferParams,
  TransferResult,
  TransferStatus,
  UpdatePlanParams,
  VerifyResult,
  WebhookEvent,
  WebhookEventType,
} from "../types";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com";

/**
 * Flutterwave works in major currency units (naira, not kobo), so pay-kit
 * converts to/from its canonical subunit representation at the boundary.
 */
function toMajor(subunits: number): number {
  return subunits / 100;
}
function toSubunits(major: unknown): number {
  return Math.round(Number(major ?? 0) * 100);
}

function mapStatus(raw: unknown): PaymentStatus {
  // Charges report lower-case ("successful"), payouts upper-case ("SUCCESSFUL").
  switch (typeof raw === "string" ? raw.toLowerCase() : raw) {
    case "successful":
    case "success":
      return "success";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function mapChargeEventType(status: PaymentStatus): WebhookEventType {
  if (status === "success") return "charge.success";
  if (status === "failed") return "charge.failed";
  return "unknown";
}

function mapTransferEventType(status: PaymentStatus): WebhookEventType {
  if (status === "success") return "transfer.success";
  if (status === "failed") return "transfer.failed";
  return "unknown";
}

function mapRefundStatus(raw: unknown): RefundStatus {
  switch (raw) {
    case "completed":
    case "successful":
    case "success":
    case "processed":
      return "processed";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function mapTransferStatus(raw: unknown): TransferStatus {
  switch (raw) {
    case "SUCCESSFUL":
    case "successful":
    case "success":
    case "completed":
      return "success";
    case "FAILED":
    case "failed":
      return "failed";
    default:
      // "NEW" and "PENDING" mean the transfer is still processing.
      return "pending";
  }
}

/** Canonical intervals -> Flutterwave's names (`biannually` is `bi-annually` there). */
const PLAN_INTERVALS: Record<string, string> = {
  biannually: "bi-annually",
};

function toFlutterwaveInterval(interval: string): string {
  return PLAN_INTERVALS[interval] ?? interval;
}

/** Flutterwave keys plans by a numeric id - validate before sending. */
function toFlutterwavePlanId(plan: string): number {
  const id = Number(plan);
  if (!Number.isFinite(id)) {
    throw new PayKitError(
      "Flutterwave `plan` must be the numeric payment plan id returned by createPlan",
      { code: "config_error", provider: "flutterwave" },
    );
  }
  return id;
}

function mapPlan(data: Record<string, unknown>): Plan {
  return {
    id: data.id !== undefined ? String(data.id) : "",
    name: String(data.name ?? ""),
    amount: data.amount !== undefined ? toSubunits(data.amount) : undefined,
    interval: data.interval ? String(data.interval) : undefined,
    currency: data.currency ? String(data.currency) : undefined,
    status: data.status ? String(data.status) : undefined,
    duration: data.duration !== undefined ? Number(data.duration) : undefined,
    raw: data,
  };
}

function mapSubscription(data: Record<string, unknown>): Subscription {
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const plan = (data.payment_plan ?? data.plan ?? {}) as Record<string, unknown>;
  return {
    id: data.id !== undefined ? String(data.id) : "",
    customer: customer.email ? String(customer.email) : undefined,
    plan:
      plan.id !== undefined
        ? String(plan.id)
        : plan.name
          ? String(plan.name)
          : undefined,
    status: data.status ? String(data.status) : undefined,
    nextPaymentDate: data.next_payment_date ? String(data.next_payment_date) : undefined,
    createdAt: data.created_at ? String(data.created_at) : undefined,
    raw: data,
  };
}

export function createFlutterwaveProvider(ctx: ProviderContext): PaymentProvider {
  const base = ctx.baseUrl ?? FLUTTERWAVE_BASE;

  return {
    name: "flutterwave",

    async initialize(params: InitializeParams): Promise<InitializeResult> {
      // Flutterwave's hosted checkout requires a redirect URL - unlike Paystack,
      // where it is optional. Surface that clearly instead of a cryptic 400.
      if (!params.callbackUrl) {
        throw new PayKitError(
          "Flutterwave requires `callbackUrl` (the redirect_url the customer returns to after payment)",
          { code: "config_error", provider: "flutterwave" },
        );
      }

      const reference = params.reference ?? ctx.generateReference();
      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/payments`, {
        method: "POST",
        body: JSON.stringify({
          tx_ref: reference,
          amount: toMajor(params.amount),
          currency: params.currency ?? "NGN",
          redirect_url: params.callbackUrl,
          customer: { email: params.email },
          meta: params.metadata,
          ...(params.split
            ? {
                subaccounts: [
                  {
                    id: params.split.subaccount,
                    ...(params.split.transactionCharge !== undefined
                      ? {
                          transaction_charge_type: "flat",
                          transaction_charge: toMajor(params.split.transactionCharge),
                        }
                      : {}),
                  },
                ],
              }
            : {}),
          ...(params.plan !== undefined ? { payment_plan: toFlutterwavePlanId(params.plan) } : {}),
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        reference,
        authorizationUrl: String(data.link ?? ""),
        raw: body,
      };
    },

    async verify(reference: string): Promise<VerifyResult> {
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
        { method: "GET" },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      const customer = (data.customer ?? {}) as Record<string, unknown>;
      const card = (data.card ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.tx_ref ?? reference),
        status: mapStatus(data.status),
        amount: toSubunits(data.amount),
        currency: String(data.currency ?? ""),
        paidAt: data.created_at ? String(data.created_at) : undefined,
        channel: data.payment_type ? String(data.payment_type) : undefined,
        customer: { email: customer.email ? String(customer.email) : undefined },
        authorization: card.token ? String(card.token) : undefined,
        raw: body,
      };
    },

    async chargeAuthorization(params: ChargeAuthorizationParams): Promise<VerifyResult> {
      // Flutterwave's tokenized charge requires a redirect_url (it can trigger an
      // auth step) - unlike Paystack. Surface it clearly instead of a cryptic 400.
      if (!params.callbackUrl) {
        throw new PayKitError(
          "Flutterwave `chargeAuthorization` requires `callbackUrl` (the redirect_url for the re-charge)",
          { code: "config_error", provider: "flutterwave" },
        );
      }

      const reference = params.reference ?? ctx.generateReference();
      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/tokenized-charges`, {
        method: "POST",
        body: JSON.stringify({
          token: params.authorizationCode,
          email: params.email,
          amount: toMajor(params.amount),
          currency: params.currency ?? "NGN",
          redirect_url: params.callbackUrl,
          tx_ref: reference,
          meta: params.metadata,
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      const customer = (data.customer ?? {}) as Record<string, unknown>;
      const card = (data.card ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.tx_ref ?? reference),
        status: mapStatus(data.status),
        amount: data.amount !== undefined ? toSubunits(data.amount) : params.amount,
        currency: String(data.currency ?? params.currency ?? ""),
        paidAt: data.created_at ? String(data.created_at) : undefined,
        channel: data.payment_type ? String(data.payment_type) : undefined,
        customer: { email: customer.email ? String(customer.email) : params.email },
        authorization: card.token ? String(card.token) : params.authorizationCode,
        raw: body,
      };
    },

    async refund(reference: string, options?: RefundOptions): Promise<RefundResult> {
      // Flutterwave refunds are keyed by the numeric transaction id, not tx_ref,
      // so resolve the id from the reference first.
      const verifyBody = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
        { method: "GET" },
      );
      const verifyData = (verifyBody.data ?? {}) as Record<string, unknown>;
      const id = verifyData.id;
      if (id === undefined || id === null) {
        throw new PayKitError(
          `No Flutterwave transaction found for reference "${reference}"`,
          { code: "provider_error", provider: "flutterwave", raw: verifyBody },
        );
      }

      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/transactions/${encodeURIComponent(String(id))}/refund`,
        {
          method: "POST",
          body: JSON.stringify(
            options?.amount !== undefined ? { amount: toMajor(options.amount) } : {},
          ),
        },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      const refunded = data.amount_refunded ?? data.amount;
      return {
        reference,
        status: mapRefundStatus(data.status),
        amount: refunded !== undefined ? toSubunits(refunded) : undefined,
        raw: body,
      };
    },

    async transfer(params: TransferParams): Promise<TransferResult> {
      // Flutterwave takes the destination account inline - no recipient step.
      const reference = params.reference ?? ctx.generateReference();
      const currency = params.currency ?? params.recipient.currency ?? "NGN";
      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/transfers`, {
        method: "POST",
        body: JSON.stringify({
          account_bank: params.recipient.bankCode,
          account_number: params.recipient.accountNumber,
          amount: toMajor(params.amount),
          currency,
          narration: params.reason,
          reference,
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.reference ?? reference),
        status: mapTransferStatus(data.status),
        amount: data.amount !== undefined ? toSubunits(data.amount) : params.amount,
        transferId: data.id !== undefined ? String(data.id) : undefined,
        raw: body,
      };
    },

    async verifyTransfer(transferId: string): Promise<TransferResult> {
      // Flutterwave keys transfer lookups by the numeric transfer id.
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/transfers/${encodeURIComponent(transferId)}`,
        { method: "GET" },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.reference ?? transferId),
        status: mapTransferStatus(data.status),
        amount: data.amount !== undefined ? toSubunits(data.amount) : undefined,
        transferId: data.id !== undefined ? String(data.id) : transferId,
        raw: body,
      };
    },

    async resolveAccount(params: ResolveAccountParams): Promise<ResolvedAccount> {
      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/accounts/resolve`, {
        method: "POST",
        body: JSON.stringify({
          account_number: params.accountNumber,
          account_bank: params.bankCode,
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        accountNumber: String(data.account_number ?? params.accountNumber),
        accountName: String(data.account_name ?? ""),
        bankCode: params.bankCode,
        raw: body,
      };
    },

    async listBanks(options?: ListBanksOptions): Promise<Bank[]> {
      // Flutterwave keys its bank list by ISO-3166 alpha-2 country code.
      const country = (options?.country ?? "NG").toUpperCase();
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/banks/${encodeURIComponent(country)}`,
        { method: "GET" },
      );

      const list = Array.isArray(body.data) ? body.data : [];
      return list.map((entry) => {
        const bank = (entry ?? {}) as Record<string, unknown>;
        return { name: String(bank.name ?? ""), code: String(bank.code ?? "") };
      });
    },

    async getBalances(): Promise<ProviderBalance[]> {
      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/balances`, {
        method: "GET",
      });
      const list = Array.isArray(body.data) ? body.data : [];
      return list.map((entry) => {
        const bal = (entry ?? {}) as Record<string, unknown>;
        // Flutterwave reports balances in major units - convert to subunits.
        return {
          currency: String(bal.currency ?? ""),
          available: toSubunits(bal.available_balance),
          raw: bal,
        };
      });
    },

    async listTransactions(options?: ListTransactionsOptions): Promise<TransactionList> {
      const query = new URLSearchParams();
      if (options?.page) query.set("page", String(options.page));
      const suffix = query.toString() ? `?${query}` : "";
      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/transactions${suffix}`, {
        method: "GET",
      });

      const list = Array.isArray(body.data) ? body.data : [];
      return {
        transactions: list.map((entry) => {
          const tx = (entry ?? {}) as Record<string, unknown>;
          const customer = (tx.customer ?? {}) as Record<string, unknown>;
          return {
            reference: String(tx.tx_ref ?? ""),
            status: mapStatus(tx.status),
            amount: toSubunits(tx.amount),
            currency: String(tx.currency ?? ""),
            paidAt: tx.created_at ? String(tx.created_at) : undefined,
            customer: { email: customer.email ? String(customer.email) : undefined },
            raw: tx,
          };
        }),
        page: options?.page,
        raw: body,
      };
    },

    async createSubaccount(params: CreateSubaccountParams): Promise<Subaccount> {
      // Flutterwave requires a business_email on subaccount creation - surface it
      // clearly instead of a cryptic 400.
      if (!params.email) {
        throw new PayKitError(
          "Flutterwave `createSubaccount` requires `email` (the subaccount's business_email)",
          { code: "config_error", provider: "flutterwave" },
        );
      }

      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/subaccounts`, {
        method: "POST",
        body: JSON.stringify({
          account_bank: params.bankCode,
          account_number: params.accountNumber,
          business_name: params.businessName,
          business_email: params.email,
          country: (params.country ?? "NG").toUpperCase(),
          split_type: "percentage",
          // Flutterwave expresses a percentage split as a 0-1 fraction.
          split_value: params.percentageCharge / 100,
          meta: params.metadata,
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        id: String(data.subaccount_id ?? ""),
        businessName: data.business_name ? String(data.business_name) : params.businessName,
        accountNumber: data.account_number ? String(data.account_number) : params.accountNumber,
        bankCode: params.bankCode,
        raw: body,
      };
    },

    async createPlan(params: CreatePlanParams): Promise<Plan> {
      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/payment-plans`, {
        method: "POST",
        body: JSON.stringify({
          name: params.name,
          // Flutterwave takes major units - and the amount is optional there
          // (dynamic amounts per customer at charge time).
          ...(params.amount !== undefined ? { amount: toMajor(params.amount) } : {}),
          interval: toFlutterwaveInterval(params.interval),
          currency: params.currency ?? "NGN",
          duration: params.duration,
        }),
      });
      return mapPlan((body.data ?? {}) as Record<string, unknown>);
    },

    async listPlans(options?: ListPlansOptions): Promise<PlanList> {
      const query = new URLSearchParams();
      if (options?.page) query.set("page", String(options.page));
      if (options?.perPage) query.set("per_page", String(options.perPage));
      if (options?.status) query.set("status", options.status);
      const suffix = query.toString() ? `?${query}` : "";
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/payment-plans${suffix}`,
        { method: "GET" },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.payment_plans)
          ? data.payment_plans
          : [];
      return {
        plans: list.map((entry) => mapPlan((entry ?? {}) as Record<string, unknown>)),
        page: typeof data.page === "number" ? data.page : options?.page,
        raw: body,
      };
    },

    async fetchPlan(idOrCode: string): Promise<Plan> {
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/payment-plans/${encodeURIComponent(idOrCode)}`,
        { method: "GET" },
      );
      return mapPlan((body.data ?? {}) as Record<string, unknown>);
    },

    async updatePlan(idOrCode: string, params: UpdatePlanParams): Promise<Plan> {
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/payment-plans/${encodeURIComponent(idOrCode)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: params.name,
            ...(params.amount !== undefined ? { amount: toMajor(params.amount) } : {}),
            duration: params.duration,
          }),
        },
      );
      return mapPlan((body.data ?? {}) as Record<string, unknown>);
    },

    async cancelPlan(idOrCode: string): Promise<Plan> {
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/payment-plans/${encodeURIComponent(idOrCode)}/cancel`,
        { method: "PUT" },
      );
      return mapPlan((body.data ?? {}) as Record<string, unknown>);
    },

    async createSubscription(_params: CreateSubscriptionParams): Promise<Subscription> {
      throw new PayKitError(
        "Flutterwave creates subscriptions automatically when a charge carries a plan - pass `plan` to initialize() instead",
        { code: "unsupported", provider: "flutterwave" },
      );
    },

    async listSubscriptions(options?: ListSubscriptionsOptions): Promise<SubscriptionList> {
      const query = new URLSearchParams();
      if (options?.page) query.set("page", String(options.page));
      if (options?.perPage) query.set("per_page", String(options.perPage));
      if (options?.plan) query.set("plan", options.plan);
      const suffix = query.toString() ? `?${query}` : "";
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/subscriptions${suffix}`,
        { method: "GET" },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.subscriptions)
          ? data.subscriptions
          : [];
      return {
        subscriptions: list.map((entry) =>
          mapSubscription((entry ?? {}) as Record<string, unknown>),
        ),
        page: typeof data.page === "number" ? data.page : options?.page,
        raw: body,
      };
    },

    async fetchSubscription(idOrCode: string): Promise<Subscription> {
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/subscriptions/${encodeURIComponent(idOrCode)}`,
        { method: "GET" },
      );
      return mapSubscription((body.data ?? {}) as Record<string, unknown>);
    },

    async cancelSubscription(idOrCode: string): Promise<Subscription> {
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/subscriptions/${encodeURIComponent(idOrCode)}/cancel`,
        { method: "PUT" },
      );
      return mapSubscription((body.data ?? {}) as Record<string, unknown>);
    },

    async enableSubscription(idOrCode: string): Promise<Subscription> {
      const body = await providerRequest(
        ctx,
        "flutterwave",
        `${base}/v3/subscriptions/${encodeURIComponent(idOrCode)}/activate`,
        { method: "PUT" },
      );
      return mapSubscription((body.data ?? {}) as Record<string, unknown>);
    },

    constructWebhookEvent(rawBody: string, signature: string): WebhookEvent {
      // Flutterwave sends the "Secret hash" verbatim in the `verif-hash` header.
      if (!ctx.webhookSecret) {
        throw new PayKitError(
          "Flutterwave webhook verification requires `webhookSecret` (your Secret hash)",
          { code: "config_error", provider: "flutterwave" },
        );
      }
      if (!signature || !safeEqual(ctx.webhookSecret, signature)) {
        throw new PayKitError("Invalid Flutterwave webhook signature", {
          code: "invalid_signature",
          provider: "flutterwave",
        });
      }

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(rawBody) as Record<string, unknown>;
      } catch (err) {
        throw new PayKitError("Malformed Flutterwave webhook body", {
          code: "provider_error",
          provider: "flutterwave",
          cause: err,
        });
      }

      // Flutterwave sends two webhook shapes: the newer `{ event, data: {...} }`
      // and a flat legacy payload (`txRef`/`amount`/`status` at the top level).
      // Read from `data` when present, else fall back to the root.
      const data = (event.data ?? event) as Record<string, unknown>;
      const status = mapStatus(data.status);
      const amount = data.amount !== undefined ? toSubunits(data.amount) : undefined;
      const currency = data.currency ? String(data.currency) : undefined;
      const eventName = typeof event.event === "string" ? event.event : "";

      // Payout webhooks (`transfer.*`) carry `reference` (not `tx_ref`) and an
      // upper-cased status, so they need their own mapping - otherwise a real
      // payout delivery comes out as an empty `unknown` event.
      if (eventName.startsWith("transfer")) {
        const transferRef = data.reference ?? data.tx_ref ?? data.txRef;
        return {
          type: mapTransferEventType(status),
          reference: transferRef !== undefined ? String(transferRef) : "",
          status,
          amount,
          currency,
          raw: event,
        };
      }

      // Charge webhooks: accept both `tx_ref` and `txRef`.
      const reference = data.tx_ref ?? data.txRef;
      return {
        type: mapChargeEventType(status),
        reference: reference !== undefined ? String(reference) : "",
        status,
        amount,
        currency,
        raw: event,
      };
    },
  };
}
