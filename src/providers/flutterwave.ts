import { PayKitError } from "../errors";
import { providerRequest, safeEqual } from "../internal";
import type {
  Bank,
  ChargeAuthorizationParams,
  InitializeParams,
  InitializeResult,
  ListBanksOptions,
  ListTransactionsOptions,
  PaymentProvider,
  PaymentStatus,
  ProviderBalance,
  ProviderContext,
  RefundOptions,
  RefundResult,
  RefundStatus,
  ResolveAccountParams,
  ResolvedAccount,
  TransactionList,
  TransferParams,
  TransferResult,
  TransferStatus,
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
  switch (raw) {
    case "successful":
    case "success":
      return "success";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function mapEventType(status: PaymentStatus): WebhookEventType {
  if (status === "success") return "charge.success";
  if (status === "failed") return "charge.failed";
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

export function createFlutterwaveProvider(ctx: ProviderContext): PaymentProvider {
  const base = ctx.baseUrl ?? FLUTTERWAVE_BASE;

  return {
    name: "flutterwave",

    async initialize(params: InitializeParams): Promise<InitializeResult> {
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
      const reference = params.reference ?? ctx.generateReference();
      const body = await providerRequest(ctx, "flutterwave", `${base}/v3/tokenized-charges`, {
        method: "POST",
        body: JSON.stringify({
          token: params.authorizationCode,
          email: params.email,
          amount: toMajor(params.amount),
          currency: params.currency ?? "NGN",
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

      const data = (event.data ?? {}) as Record<string, unknown>;
      const status = mapStatus(data.status);
      return {
        type: mapEventType(status),
        reference: String(data.tx_ref ?? ""),
        status,
        amount: data.amount !== undefined ? toSubunits(data.amount) : undefined,
        currency: data.currency ? String(data.currency) : undefined,
        raw: event,
      };
    },
  };
}
