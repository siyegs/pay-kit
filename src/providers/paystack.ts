import { createHmac } from "node:crypto";
import { PayKitError } from "../errors";
import { providerRequest, safeEqual } from "../internal";
import type {
  Bank,
  InitializeParams,
  InitializeResult,
  ListBanksOptions,
  PaymentProvider,
  PaymentStatus,
  ProviderContext,
  RefundOptions,
  RefundResult,
  RefundStatus,
  ResolveAccountParams,
  ResolvedAccount,
  TransferParams,
  TransferResult,
  TransferStatus,
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
      return {
        reference: String(data.reference ?? reference),
        status: mapStatus(data.status),
        amount: Number(data.amount ?? 0),
        currency: String(data.currency ?? ""),
        paidAt: data.paid_at ? String(data.paid_at) : undefined,
        channel: data.channel ? String(data.channel) : undefined,
        customer: { email: customer.email ? String(customer.email) : undefined },
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
