import { createHmac } from "node:crypto";
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
  SubscriptionActionParams,
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

const PAYSTACK_BASE = "https://api.paystack.co";

/** Paystack's `/bank` list is filtered by currency, so map country -> currency. */
const COUNTRY_CURRENCY: Record<string, string> = {
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  ZA: "ZAR",
  CI: "XOF",
  EG: "EGP",
  US: "USD",
};

/** Paystack uses subunits (kobo) natively - matches pay-kit's canonical unit. */
function mapStatus(raw: unknown): PaymentStatus {
  switch (raw) {
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "abandoned":
      return "abandoned";
    default:
      return "pending";
  }
}

function mapTransferStatus(raw: unknown): TransferStatus {
  switch (raw) {
    case "success":
    case "successful":
      return "success";
    case "failed":
    case "reversed":
    case "abandoned":
      return "failed";
    default:
      // "pending" and "otp" both mean the transfer is still in flight.
      return "pending";
  }
}

function mapEventType(event: unknown): WebhookEventType {
  return typeof event === "string" && event.length > 0 ? event : "unknown";
}

function mapRefundStatus(raw: unknown): RefundStatus {
  switch (raw) {
    case "processed":
    case "success":
      return "processed";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

/** Canonical intervals -> Paystack's names (`yearly` is `annually` there). */
const PLAN_INTERVALS: Record<string, string> = {
  yearly: "annually",
};

function toPaystackInterval(interval: string): string {
  return PLAN_INTERVALS[interval] ?? interval;
}

function mapPlan(data: Record<string, unknown>): Plan {
  return {
    id: String(data.plan_code ?? ""),
    name: String(data.name ?? ""),
    amount: data.amount !== undefined ? Number(data.amount) : undefined,
    interval: data.interval ? String(data.interval) : undefined,
    currency: data.currency ? String(data.currency) : undefined,
    status: data.status ? String(data.status) : undefined,
    duration: data.duration !== undefined ? Number(data.duration) : undefined,
    raw: data,
  };
}

function mapSubscription(data: Record<string, unknown>): Subscription {
  const plan = (data.plan ?? {}) as Record<string, unknown>;
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  return {
    id: String(data.subscription_code ?? data.id ?? ""),
    customer: data.customer
      ? String(customer.customer_code ?? customer.email ?? data.customer)
      : undefined,
    plan: data.plan
      ? String(plan.plan_code ?? plan.name ?? plan.id ?? data.plan)
      : undefined,
    status: data.status ? String(data.status) : undefined,
    nextPaymentDate: data.next_payment_date ? String(data.next_payment_date) : undefined,
    emailToken: data.email_token ? String(data.email_token) : undefined,
    createdAt: data.created_at ? String(data.created_at) : undefined,
    raw: data,
  };
}

/** Enable/disable a Paystack subscription - both need the email token. */
async function subscriptionAction(
  ctx: ProviderContext,
  base: string,
  action: "enable" | "disable",
  idOrCode: string,
  params?: SubscriptionActionParams,
): Promise<Record<string, unknown>> {
  if (!params?.token) {
    throw new PayKitError(
      `Paystack subscription ${action} requires the email \`token\` returned by createSubscription`,
      { code: "config_error", provider: "paystack" },
    );
  }
  return providerRequest(ctx, "paystack", `${base}/subscription/${action}`, {
    method: "POST",
    body: JSON.stringify({ code: idOrCode, token: params.token }),
  });
}

export function createPaystackProvider(ctx: ProviderContext): PaymentProvider {
  const base = ctx.baseUrl ?? PAYSTACK_BASE;

  return {
    name: "paystack",

    async initialize(params: InitializeParams): Promise<InitializeResult> {
      const reference = params.reference ?? ctx.generateReference();
      const body = await providerRequest(ctx, "paystack", `${base}/transaction/initialize`, {
        method: "POST",
        body: JSON.stringify({
          amount: params.amount,
          email: params.email,
          currency: params.currency ?? "NGN",
          reference,
          callback_url: params.callbackUrl,
          metadata: params.metadata,
          ...(params.split
            ? {
                subaccount: params.split.subaccount,
                ...(params.split.transactionCharge !== undefined
                  ? { transaction_charge: params.split.transactionCharge }
                  : {}),
                ...(params.split.bearer ? { bearer: params.split.bearer } : {}),
              }
            : {}),
          ...(params.plan ? { plan: params.plan } : {}),
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.reference ?? reference),
        authorizationUrl: String(data.authorization_url ?? ""),
        accessCode: data.access_code ? String(data.access_code) : undefined,
        raw: body,
      };
    },

    async verify(reference: string): Promise<VerifyResult> {
      const body = await providerRequest(
        ctx,
        "paystack",
        `${base}/transaction/verify/${encodeURIComponent(reference)}`,
        { method: "GET" },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      const customer = (data.customer ?? {}) as Record<string, unknown>;
      const authorization = (data.authorization ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.reference ?? reference),
        status: mapStatus(data.status),
        amount: Number(data.amount ?? 0),
        currency: String(data.currency ?? ""),
        paidAt: data.paid_at ? String(data.paid_at) : undefined,
        channel: data.channel ? String(data.channel) : undefined,
        customer: { email: customer.email ? String(customer.email) : undefined },
        authorization: authorization.authorization_code
          ? String(authorization.authorization_code)
          : undefined,
        raw: body,
      };
    },

    async chargeAuthorization(params: ChargeAuthorizationParams): Promise<VerifyResult> {
      const reference = params.reference ?? ctx.generateReference();
      const body = await providerRequest(
        ctx,
        "paystack",
        `${base}/transaction/charge_authorization`,
        {
          method: "POST",
          body: JSON.stringify({
            authorization_code: params.authorizationCode,
            email: params.email,
            amount: params.amount,
            currency: params.currency ?? "NGN",
            reference,
            metadata: params.metadata,
          }),
        },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      const customer = (data.customer ?? {}) as Record<string, unknown>;
      const authorization = (data.authorization ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.reference ?? reference),
        status: mapStatus(data.status),
        amount: Number(data.amount ?? params.amount),
        currency: String(data.currency ?? params.currency ?? ""),
        paidAt: data.paid_at ? String(data.paid_at) : undefined,
        channel: data.channel ? String(data.channel) : undefined,
        customer: { email: customer.email ? String(customer.email) : params.email },
        authorization: authorization.authorization_code
          ? String(authorization.authorization_code)
          : params.authorizationCode,
        raw: body,
      };
    },

    async refund(reference: string, options?: RefundOptions): Promise<RefundResult> {
      const body = await providerRequest(ctx, "paystack", `${base}/refund`, {
        method: "POST",
        body: JSON.stringify({
          transaction: reference,
          ...(options?.amount !== undefined ? { amount: options.amount } : {}),
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      const transaction = (data.transaction ?? {}) as Record<string, unknown>;
      return {
        reference: String(transaction.reference ?? reference),
        status: mapRefundStatus(data.status),
        amount: data.amount !== undefined ? Number(data.amount) : undefined,
        raw: body,
      };
    },

    async transfer(params: TransferParams): Promise<TransferResult> {
      const reference = params.reference ?? ctx.generateReference();
      const currency = params.currency ?? params.recipient.currency ?? "NGN";

      // Paystack requires a transfer recipient before a payout can be sent.
      const recipientBody = await providerRequest(ctx, "paystack", `${base}/transferrecipient`, {
        method: "POST",
        body: JSON.stringify({
          type: "nuban",
          name: params.recipient.name ?? params.recipient.accountNumber,
          account_number: params.recipient.accountNumber,
          bank_code: params.recipient.bankCode,
          currency,
        }),
      });
      const recipientData = (recipientBody.data ?? {}) as Record<string, unknown>;
      const recipientCode = recipientData.recipient_code
        ? String(recipientData.recipient_code)
        : undefined;
      if (!recipientCode) {
        throw new PayKitError("Paystack did not return a transfer recipient code", {
          code: "provider_error",
          provider: "paystack",
          raw: recipientBody,
        });
      }

      const body = await providerRequest(ctx, "paystack", `${base}/transfer`, {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          amount: params.amount,
          recipient: recipientCode,
          currency,
          reason: params.reason,
          reference,
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.reference ?? reference),
        status: mapTransferStatus(data.status),
        amount: data.amount !== undefined ? Number(data.amount) : params.amount,
        transferId: data.transfer_code ? String(data.transfer_code) : undefined,
        recipientCode,
        raw: body,
      };
    },

    async verifyTransfer(transferId: string): Promise<TransferResult> {
      // Paystack's "fetch a transfer" accepts the transfer id or code.
      const body = await providerRequest(
        ctx,
        "paystack",
        `${base}/transfer/${encodeURIComponent(transferId)}`,
        { method: "GET" },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      const recipient = (data.recipient ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.reference ?? transferId),
        status: mapTransferStatus(data.status),
        amount: data.amount !== undefined ? Number(data.amount) : undefined,
        transferId: data.transfer_code ? String(data.transfer_code) : transferId,
        recipientCode: recipient.recipient_code ? String(recipient.recipient_code) : undefined,
        raw: body,
      };
    },

    async resolveAccount(params: ResolveAccountParams): Promise<ResolvedAccount> {
      const query = new URLSearchParams({
        account_number: params.accountNumber,
        bank_code: params.bankCode,
      });
      const body = await providerRequest(ctx, "paystack", `${base}/bank/resolve?${query}`, {
        method: "GET",
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
      const country = (options?.country ?? "NG").toUpperCase();
      const currency = COUNTRY_CURRENCY[country] ?? "NGN";
      const body = await providerRequest(ctx, "paystack", `${base}/bank?currency=${currency}`, {
        method: "GET",
      });

      const list = Array.isArray(body.data) ? body.data : [];
      return list.map((entry) => {
        const bank = (entry ?? {}) as Record<string, unknown>;
        return { name: String(bank.name ?? ""), code: String(bank.code ?? "") };
      });
    },

    async getBalances(): Promise<ProviderBalance[]> {
      const body = await providerRequest(ctx, "paystack", `${base}/balance`, { method: "GET" });
      const list = Array.isArray(body.data) ? body.data : [];
      return list.map((entry) => {
        const bal = (entry ?? {}) as Record<string, unknown>;
        // Paystack reports balance in subunits (kobo) already.
        return {
          currency: String(bal.currency ?? ""),
          available: Number(bal.balance ?? 0),
          raw: bal,
        };
      });
    },

    async listTransactions(options?: ListTransactionsOptions): Promise<TransactionList> {
      const query = new URLSearchParams();
      if (options?.perPage) query.set("perPage", String(options.perPage));
      if (options?.page) query.set("page", String(options.page));
      const suffix = query.toString() ? `?${query}` : "";
      const body = await providerRequest(ctx, "paystack", `${base}/transaction${suffix}`, {
        method: "GET",
      });

      const list = Array.isArray(body.data) ? body.data : [];
      const meta = (body.meta ?? {}) as Record<string, unknown>;
      return {
        transactions: list.map((entry) => {
          const tx = (entry ?? {}) as Record<string, unknown>;
          const customer = (tx.customer ?? {}) as Record<string, unknown>;
          return {
            reference: String(tx.reference ?? ""),
            status: mapStatus(tx.status),
            amount: Number(tx.amount ?? 0),
            currency: String(tx.currency ?? ""),
            paidAt: tx.paid_at ? String(tx.paid_at) : undefined,
            customer: { email: customer.email ? String(customer.email) : undefined },
            raw: tx,
          };
        }),
        page: meta.page !== undefined ? Number(meta.page) : options?.page,
        raw: body,
      };
    },

    async createSubaccount(params: CreateSubaccountParams): Promise<Subaccount> {
      const body = await providerRequest(ctx, "paystack", `${base}/subaccount`, {
        method: "POST",
        body: JSON.stringify({
          business_name: params.businessName,
          settlement_bank: params.bankCode,
          account_number: params.accountNumber,
          percentage_charge: params.percentageCharge,
          ...(params.email ? { primary_contact_email: params.email } : {}),
          ...(params.metadata ? { metadata: params.metadata } : {}),
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        id: String(data.subaccount_code ?? ""),
        businessName: data.business_name ? String(data.business_name) : params.businessName,
        accountNumber: String(data.account_number ?? params.accountNumber),
        bankCode: params.bankCode,
        raw: body,
      };
    },

    async createPlan(params: CreatePlanParams): Promise<Plan> {
      if (params.amount === undefined) {
        throw new PayKitError("Paystack `createPlan` requires `amount` (in subunits)", {
          code: "config_error",
          provider: "paystack",
        });
      }
      const body = await providerRequest(ctx, "paystack", `${base}/plan`, {
        method: "POST",
        body: JSON.stringify({
          name: params.name,
          amount: params.amount,
          interval: toPaystackInterval(params.interval),
          description: params.description,
          currency: params.currency ?? "NGN",
          send_invoices: params.sendInvoices,
          send_sms: params.sendSms,
          invoice_limit: params.invoiceLimit,
          metadata: params.metadata,
        }),
      });
      return mapPlan((body.data ?? {}) as Record<string, unknown>);
    },

    async listPlans(options?: ListPlansOptions): Promise<PlanList> {
      const query = new URLSearchParams();
      if (options?.perPage) query.set("perPage", String(options.perPage));
      if (options?.page) query.set("page", String(options.page));
      if (options?.status) query.set("status", options.status);
      if (options?.currency) query.set("currency", options.currency);
      const suffix = query.toString() ? `?${query}` : "";
      const body = await providerRequest(ctx, "paystack", `${base}/plan${suffix}`, {
        method: "GET",
      });

      const list = Array.isArray(body.data) ? body.data : [];
      const meta = (body.meta ?? {}) as Record<string, unknown>;
      return {
        plans: list.map((entry) => mapPlan((entry ?? {}) as Record<string, unknown>)),
        page: meta.page !== undefined ? Number(meta.page) : options?.page,
        raw: body,
      };
    },

    async fetchPlan(idOrCode: string): Promise<Plan> {
      const body = await providerRequest(
        ctx,
        "paystack",
        `${base}/plan/${encodeURIComponent(idOrCode)}`,
        { method: "GET" },
      );
      return mapPlan((body.data ?? {}) as Record<string, unknown>);
    },

    async updatePlan(idOrCode: string, params: UpdatePlanParams): Promise<Plan> {
      const body = await providerRequest(
        ctx,
        "paystack",
        `${base}/plan/${encodeURIComponent(idOrCode)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: params.name,
            amount: params.amount,
            interval:
              params.interval !== undefined
                ? toPaystackInterval(params.interval)
                : undefined,
            description: params.description,
            currency: params.currency,
            send_invoices: params.sendInvoices,
            send_sms: params.sendSms,
            invoice_limit: params.invoiceLimit,
          }),
        },
      );
      return mapPlan((body.data ?? {}) as Record<string, unknown>);
    },

    async cancelPlan(_idOrCode: string): Promise<Plan> {
      throw new PayKitError(
        "Paystack has no cancel-plan endpoint - update the plan or disable its subscriptions instead",
        { code: "unsupported", provider: "paystack" },
      );
    },

    async createSubscription(params: CreateSubscriptionParams): Promise<Subscription> {
      const body = await providerRequest(ctx, "paystack", `${base}/subscription`, {
        method: "POST",
        body: JSON.stringify({
          customer: params.customer,
          plan: params.plan,
          authorization: params.authorization,
          start_date: params.startDate,
          end_date: params.endDate,
        }),
      });
      return mapSubscription((body.data ?? {}) as Record<string, unknown>);
    },

    async listSubscriptions(options?: ListSubscriptionsOptions): Promise<SubscriptionList> {
      const query = new URLSearchParams();
      if (options?.perPage) query.set("perPage", String(options.perPage));
      if (options?.page) query.set("page", String(options.page));
      if (options?.plan) query.set("plan", options.plan);
      if (options?.customer) query.set("customer", options.customer);
      if (options?.status) query.set("status", options.status);
      const suffix = query.toString() ? `?${query}` : "";
      const body = await providerRequest(ctx, "paystack", `${base}/subscription${suffix}`, {
        method: "GET",
      });

      const list = Array.isArray(body.data) ? body.data : [];
      const meta = (body.meta ?? {}) as Record<string, unknown>;
      return {
        subscriptions: list.map((entry) =>
          mapSubscription((entry ?? {}) as Record<string, unknown>),
        ),
        page: meta.page !== undefined ? Number(meta.page) : options?.page,
        raw: body,
      };
    },

    async fetchSubscription(idOrCode: string): Promise<Subscription> {
      const body = await providerRequest(
        ctx,
        "paystack",
        `${base}/subscription/${encodeURIComponent(idOrCode)}`,
        { method: "GET" },
      );
      return mapSubscription((body.data ?? {}) as Record<string, unknown>);
    },

    async cancelSubscription(
      idOrCode: string,
      params?: SubscriptionActionParams,
    ): Promise<Subscription> {
      const body = await subscriptionAction(ctx, base, "disable", idOrCode, params);
      return { id: idOrCode, status: "cancelled", raw: body };
    },

    async enableSubscription(
      idOrCode: string,
      params?: SubscriptionActionParams,
    ): Promise<Subscription> {
      const body = await subscriptionAction(ctx, base, "enable", idOrCode, params);
      return { id: idOrCode, status: "active", raw: body };
    },

    constructWebhookEvent(rawBody: string, signature: string): WebhookEvent {
      const expected = createHmac("sha512", ctx.secretKey).update(rawBody).digest("hex");
      if (!signature || !safeEqual(expected, signature)) {
        throw new PayKitError("Invalid Paystack webhook signature", {
          code: "invalid_signature",
          provider: "paystack",
        });
      }

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(rawBody) as Record<string, unknown>;
      } catch (err) {
        throw new PayKitError("Malformed Paystack webhook body", {
          code: "provider_error",
          provider: "paystack",
          cause: err,
        });
      }

      const data = (event.data ?? {}) as Record<string, unknown>;
      return {
        type: mapEventType(event.event),
        reference: String(data.reference ?? ""),
        status: data.status ? mapStatus(data.status) : undefined,
        amount: data.amount !== undefined ? Number(data.amount) : undefined,
        currency: data.currency ? String(data.currency) : undefined,
        raw: event,
      };
    },
  };
}
