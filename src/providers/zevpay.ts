import { createHmac } from "node:crypto";
import { PayKitError } from "../errors";
import { providerRequest, safeEqual } from "../internal";
import type {
  Bank,
  Currency,
  InitializeParams,
  InitializeResult,
  ListBanksOptions,
  PaymentProvider,
  PaymentStatus,
  ProviderBalance,
  ProviderContext,
  RefundResult,
  ResolveAccountParams,
  ResolvedAccount,
  Subaccount,
  TransactionList,
  TransferParams,
  TransferResult,
  TransferStatus,
  VerifyResult,
  WebhookEvent,
  WebhookEventType,
} from "../types";

/**
 * ZevPay Checkout adapter. Docs: https://docs.zevpaycheckout.com
 * API keys: https://dashboard.zevpaycheckout.com/api-keys
 *
 * ZevPay quotes every amount in kobo - the same unit pay-kit uses - so no
 * amounts are converted here.
 */

const ZEVPAY_BASE = "https://api.zevpaycheckout.com";
const ZEVPAY_DOCS = "https://docs.zevpaycheckout.com";

/** The payout endpoint carries no currency field, so guard rather than ignore. */
function assertNgnPayout(currency: Currency | undefined): void {
  if (currency && String(currency).toUpperCase() !== "NGN") {
    throw new PayKitError(`pay-kit sends ZevPay payouts in NGN (got "${currency}")`, {
      code: "config_error",
      provider: "zevpay",
    });
  }
}

function notImplemented(method: string): PayKitError {
  return new PayKitError(
    `\`${method}\` is not implemented for ZevPay yet - see ${ZEVPAY_DOCS} for the current API surface`,
    { code: "unsupported", provider: "zevpay" },
  );
}

/** Checkout session status -> pay-kit's normalized payment status. */
function mapStatus(raw: unknown): PaymentStatus {
  switch (raw) {
    case "completed":
      return "success";
    case "failed":
      return "failed";
    case "expired":
      return "abandoned";
    default:
      // "active" - the session is open and still awaiting payment.
      return "pending";
  }
}

function mapTransferStatus(raw: unknown): TransferStatus {
  switch (raw) {
    case "completed":
      return "success";
    case "failed":
    case "reversed":
      return "failed";
    default:
      return "pending";
  }
}

export function createZevpayProvider(ctx: ProviderContext): PaymentProvider {
  const base = ctx.baseUrl ?? ZEVPAY_BASE;

  // ZevPay accepts the key as a bearer token or as `x-api-key`; the checkout and
  // transfer docs each use one of them, so send both.
  function request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    return providerRequest(ctx, "zevpay", url, {
      ...init,
      headers: { "x-api-key": ctx.secretKey, ...(init.headers ?? {}) },
    });
  }

  async function resolveAccount(params: ResolveAccountParams): Promise<ResolvedAccount> {
    const body = await request(`${base}/v1/checkout/transfer/banks/resolve`, {
      method: "POST",
      body: JSON.stringify({
        account_number: params.accountNumber,
        bank_code: params.bankCode,
      }),
    });

    const data = (body.data ?? {}) as Record<string, unknown>;
    return {
      accountNumber: String(data.account_number ?? params.accountNumber),
      accountName: String(data.account_name ?? ""),
      bankCode: String(data.bank_code ?? params.bankCode),
      raw: body,
    };
  }

  return {
    name: "zevpay",

    /**
     * A ZevPay charge has three identifiers: the checkout `session_id`, ZevPay's
     * own transaction reference (`ZVP-CKO-S-...`), and your `reference`, which it
     * echoes as `merchant_reference`. pay-kit returns the session id, because
     * that is what `verify` takes and what ZevPay appends to your `callbackUrl`.
     * Webhooks report your own reference, so pass one you can look up.
     */
    async initialize(params: InitializeParams): Promise<InitializeResult> {
      // Dropping a split silently would send the vendor's share to the wrong
      // wallet, so refuse it rather than ignore it.
      if (params.split) throw notImplemented("split");

      const body = await request(`${base}/v1/checkout/session/initialize`, {
        method: "POST",
        body: JSON.stringify({
          amount: params.amount,
          email: params.email,
          currency: params.currency ?? "NGN",
          // Sent as ZevPay's merchant reference. Left out when the caller has
          // none, since ZevPay - not pay-kit - names the session.
          ...(params.reference ? { reference: params.reference } : {}),
          callback_url: params.callbackUrl,
          metadata: params.metadata,
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      const sessionId = data.session_id ? String(data.session_id) : "";
      if (!sessionId) {
        throw new PayKitError("ZevPay did not return a checkout session id", {
          code: "provider_error",
          provider: "zevpay",
          raw: body,
        });
      }

      return {
        reference: sessionId,
        authorizationUrl: String(data.checkout_url ?? ""),
        raw: body,
      };
    },

    /** Takes the checkout session id returned by `initialize`. */
    async verify(reference: string): Promise<VerifyResult> {
      const body = await request(
        `${base}/v1/checkout/session/${encodeURIComponent(reference)}/verify`,
        { method: "GET" },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.session_id ?? reference),
        status: mapStatus(data.status),
        amount: Number(data.amount ?? 0),
        currency: String(data.currency ?? ""),
        paidAt: data.paid_at ? String(data.paid_at) : undefined,
        channel: data.payment_method ? String(data.payment_method) : undefined,
        customer: { email: data.customer_email ? String(data.customer_email) : undefined },
        raw: body,
      };
    },

    async chargeAuthorization(): Promise<VerifyResult> {
      throw notImplemented("chargeAuthorization");
    },

    async refund(): Promise<RefundResult> {
      throw notImplemented("refund");
    },

    async transfer(params: TransferParams): Promise<TransferResult> {
      // The payout endpoint takes no currency field, so pay-kit sends naira.
      assertNgnPayout(params.currency ?? params.recipient.currency);
      const reference = params.reference ?? ctx.generateReference();

      // ZevPay requires the beneficiary name on a payout, so look it up when the
      // caller did not pass one.
      const accountName =
        params.recipient.name ??
        (
          await resolveAccount({
            accountNumber: params.recipient.accountNumber,
            bankCode: params.recipient.bankCode,
          })
        ).accountName;

      const body = await request(`${base}/v1/checkout/transfer`, {
        method: "POST",
        body: JSON.stringify({
          type: "bank_transfer",
          account_number: params.recipient.accountNumber,
          bank_code: params.recipient.bankCode,
          account_name: accountName,
          amount: params.amount,
          narration: params.reason,
          reference,
        }),
      });

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.merchant_reference ?? reference),
        status: mapTransferStatus(data.status),
        amount: data.amount !== undefined ? Number(data.amount) : params.amount,
        // Payout lookups are keyed by ZevPay's own transfer reference.
        transferId: data.reference ? String(data.reference) : undefined,
        raw: body,
      };
    },

    async verifyTransfer(transferId: string): Promise<TransferResult> {
      const body = await request(
        `${base}/v1/checkout/transfer/${encodeURIComponent(transferId)}/verify`,
        { method: "GET" },
      );

      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        reference: String(data.merchant_reference ?? data.reference ?? transferId),
        status: mapTransferStatus(data.status),
        amount: data.amount !== undefined ? Number(data.amount) : undefined,
        transferId: data.reference ? String(data.reference) : transferId,
        raw: body,
      };
    },

    resolveAccount,

    async listBanks(options?: ListBanksOptions): Promise<Bank[]> {
      const country = (options?.country ?? "NG").toUpperCase();
      if (country !== "NG") {
        throw new PayKitError(
          `ZevPay's bank list takes no country filter - omit \`country\` to list every bank it supports (got "${country}")`,
          { code: "config_error", provider: "zevpay" },
        );
      }

      const body = await request(`${base}/v1/checkout/transfer/banks`, { method: "GET" });
      const data = (body.data ?? {}) as Record<string, unknown>;
      const list = Array.isArray(data.banks) ? data.banks : [];
      return list.map((entry) => {
        const bank = (entry ?? {}) as Record<string, unknown>;
        return { name: String(bank.bankName ?? ""), code: String(bank.bankCode ?? "") };
      });
    },

    async getBalances(): Promise<ProviderBalance[]> {
      const body = await request(`${base}/v1/checkout/transfer/balance`, { method: "GET" });
      const data = (body.data ?? {}) as Record<string, unknown>;
      // One wallet, one currency - reported in kobo already.
      return [
        {
          currency: String(data.currency ?? "NGN"),
          available: Number(data.available_balance ?? 0),
          raw: data,
        },
      ];
    },

    async listTransactions(): Promise<TransactionList> {
      throw notImplemented("listTransactions");
    },

    async createSubaccount(): Promise<Subaccount> {
      throw notImplemented("createSubaccount");
    },

    constructWebhookEvent(rawBody: string, signature: string): WebhookEvent {
      if (!ctx.webhookSecret) {
        throw new PayKitError(
          "ZevPay webhook verification requires `webhookSecret` (the webhook secret on your API key pair)",
          { code: "config_error", provider: "zevpay" },
        );
      }

      const expected = createHmac("sha256", ctx.webhookSecret).update(rawBody).digest("hex");
      if (!signature || !safeEqual(expected, signature)) {
        throw new PayKitError("Invalid ZevPay webhook signature", {
          code: "invalid_signature",
          provider: "zevpay",
        });
      }

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(rawBody) as Record<string, unknown>;
      } catch (err) {
        throw new PayKitError("Malformed ZevPay webhook body", {
          code: "provider_error",
          provider: "zevpay",
          cause: err,
        });
      }

      // ZevPay's event names already match pay-kit's vocabulary (charge.success,
      // transfer.success, transfer.failed), so pass them straight through.
      const data = (event.data ?? {}) as Record<string, unknown>;
      const type: WebhookEventType =
        typeof event.event === "string" && event.event.length > 0 ? event.event : "unknown";
      const isTransfer = type.startsWith("transfer.");

      return {
        type,
        // `merchant_reference` is the reference you sent; ZevPay's own is the
        // fallback. Invoice events identify themselves by `public_id`.
        reference: String(data.merchant_reference ?? data.reference ?? data.public_id ?? ""),
        status: data.status
          ? isTransfer
            ? mapTransferStatus(data.status)
            : mapStatus(data.status)
          : undefined,
        amount: data.amount !== undefined ? Number(data.amount) : undefined,
        currency: data.currency ? String(data.currency) : undefined,
        raw: event,
      };
    },
  };
}
