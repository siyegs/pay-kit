import { PayKitError } from "../errors";
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
  ResolveAccountParams,
  ResolvedAccount,
  TransferParams,
  TransferResult,
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
}

export function createMockProvider(ctx: ProviderContext): PaymentProvider {
  const charges = new Map<string, StoredCharge>();
  const transfers = new Map<string, TransferResult>();

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
        raw: { mock: true, ...charge },
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
