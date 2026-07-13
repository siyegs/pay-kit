/** Supported providers. */
export type ProviderName = "paystack" | "flutterwave";

/** ISO-4217 currency codes commonly supported across African rails. */
export type Currency = "NGN" | "USD" | "GHS" | "KES" | "ZAR" | (string & {});

/** Normalized payment status across providers. */
export type PaymentStatus = "success" | "failed" | "pending" | "abandoned";

/** Normalized webhook event type. Providers map their native events to these. */
export type WebhookEventType =
  | "charge.success"
  | "charge.failed"
  | "transfer.success"
  | "transfer.failed"
  | "unknown"
  | (string & {});

export interface InitializeParams {
  /**
   * Amount in the smallest currency unit (subunits) - kobo for NGN, cents for USD.
   * pay-kit uses subunits everywhere (Stripe-style) to avoid float rounding bugs,
   * and converts per-provider under the hood.
   */
  amount: number;
  /** Customer email (required by both providers). */
  email: string;
  currency?: Currency;
  /** Optional custom reference. One is generated if omitted. */
  reference?: string;
  /** URL the provider redirects to after payment. */
  callbackUrl?: string;
  /** Arbitrary metadata echoed back on verify/webhook. */
  metadata?: Record<string, unknown>;
}

export interface InitializeResult {
  /** Reference to persist and later verify against. */
  reference: string;
  /** Hosted checkout URL to redirect the customer to. */
  authorizationUrl: string;
  /** Provider access code, when available (Paystack). */
  accessCode?: string;
  /** Raw provider response, for anything pay-kit does not normalize. */
  raw: unknown;
}

export interface VerifyResult {
  reference: string;
  status: PaymentStatus;
  /** Amount in subunits (kobo/cents). */
  amount: number;
  currency: string;
  paidAt?: string;
  channel?: string;
  customer?: { email?: string };
  raw: unknown;
}

export interface WebhookEvent {
  type: WebhookEventType;
  reference: string;
  status?: PaymentStatus;
  /** Amount in subunits (kobo/cents), when present on the event. */
  amount?: number;
  currency?: string;
  raw: unknown;
}

/** Normalized refund status across providers. */
export type RefundStatus = "pending" | "processed" | "failed";

export interface RefundOptions {
  /** Amount to refund in subunits. Omit for a full refund. */
  amount?: number;
}

export interface RefundResult {
  /** Reference of the original transaction being refunded. */
  reference: string;
  status: RefundStatus;
  /** Refunded amount in subunits, when reported by the provider. */
  amount?: number;
  raw: unknown;
}

/** Normalized transfer/payout status across providers. */
export type TransferStatus = "pending" | "success" | "failed";

/** Bank account a payout is sent to. */
export interface TransferRecipient {
  /** Destination bank account number (NUBAN for NGN). */
  accountNumber: string;
  /** Provider bank code for the destination bank. */
  bankCode: string;
  /** Account holder name. Recommended - Paystack stores it on the recipient. */
  name?: string;
  /** Recipient currency. Defaults to the transfer currency. */
  currency?: Currency;
}

export interface TransferParams {
  /** Amount to send in subunits (kobo/cents). */
  amount: number;
  /** Where the money goes. */
  recipient: TransferRecipient;
  currency?: Currency;
  /** Narration / reason shown on the transfer. */
  reason?: string;
  /** Idempotent reference to reconcile against. One is generated if omitted. */
  reference?: string;
}

export interface TransferResult {
  /** Reference to persist and reconcile against. */
  reference: string;
  status: TransferStatus;
  /** Amount sent in subunits, when reported by the provider. */
  amount?: number;
  /** Provider transfer id/code (Paystack transfer_code, Flutterwave id). */
  transferId?: string;
  /** Paystack recipient code created for this payout, when applicable. */
  recipientCode?: string;
  raw: unknown;
}

export interface ResolveAccountParams {
  /** Bank account number to look up. */
  accountNumber: string;
  /** Provider bank code for the account's bank (from `listBanks`). */
  bankCode: string;
}

export interface ResolvedAccount {
  accountNumber: string;
  /** Registered account holder name, for confirm-before-you-pay flows. */
  accountName: string;
  /** The bank code the lookup was performed against. */
  bankCode?: string;
  raw: unknown;
}

/** A bank supported by the provider, for populating a payout bank picker. */
export interface Bank {
  name: string;
  /** Bank code to pass as `bankCode` in transfers and account resolution. */
  code: string;
}

export interface ListBanksOptions {
  /**
   * ISO-3166 alpha-2 country code (NG, GH, KE, ZA, ...). Defaults to NG.
   * Bank codes are provider-specific, so resolve/transfer with codes from the
   * same provider you listed them from.
   */
  country?: string;
}

/** Internal context handed to each provider adapter. */
export interface ProviderContext {
  secretKey: string;
  webhookSecret?: string;
  baseUrl?: string;
  fetch: typeof fetch;
  generateReference: () => string;
}

export interface PaymentProvider {
  readonly name: ProviderName;
  initialize(params: InitializeParams): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
  refund(reference: string, options?: RefundOptions): Promise<RefundResult>;
  transfer(params: TransferParams): Promise<TransferResult>;
  resolveAccount(params: ResolveAccountParams): Promise<ResolvedAccount>;
  listBanks(options?: ListBanksOptions): Promise<Bank[]>;
  constructWebhookEvent(rawBody: string, signature: string): WebhookEvent;
}

export interface PayClientConfig {
  provider: ProviderName;
  /** Provider secret key. Server-side only - never expose to the browser. */
  secretKey: string;
  /**
   * Webhook verification secret. Flutterwave requires this ("Secret hash").
   * Paystack verifies webhooks with the secretKey, so this is optional there.
   */
  webhookSecret?: string;
  /** Override the API base URL (useful for tests / proxies). */
  baseUrl?: string;
  /** Inject a fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
  /** Override reference generation. */
  generateReference?: () => string;
}

export interface PayClient {
  readonly provider: ProviderName;
  initialize(params: InitializeParams): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
  /** Refund a transaction in full, or partially with `options.amount` (subunits). */
  refund(reference: string, options?: RefundOptions): Promise<RefundResult>;
  /** Send a payout to a bank account. Server-side only. */
  transfer(params: TransferParams): Promise<TransferResult>;
  /** Resolve an account number to its holder name before paying out. */
  resolveAccount(params: ResolveAccountParams): Promise<ResolvedAccount>;
  /** List the provider's supported banks (for a payout bank picker). */
  listBanks(options?: ListBanksOptions): Promise<Bank[]>;
  webhooks: {
    /**
     * Verify a raw webhook body against its signature header and return a
     * normalized event. Throws PayKitError("invalid_signature") on mismatch.
     */
    construct(rawBody: string, signature: string): WebhookEvent;
  };
}

/** One provider entry for a fallback client. Providers are tried in order. */
export interface FallbackProviderConfig {
  provider: ProviderName;
  secretKey: string;
  webhookSecret?: string;
  baseUrl?: string;
}

export interface FallbackClientConfig {
  /** Providers tried in order until one initializes successfully. */
  providers: FallbackProviderConfig[];
  fetch?: typeof fetch;
  generateReference?: () => string;
}

/** `initialize` result plus the provider that actually handled the charge. */
export interface FallbackInitializeResult extends InitializeResult {
  provider: ProviderName;
}

export interface FallbackClient {
  /**
   * Try each configured provider in order until one succeeds. Only outage-like
   * failures (network errors, HTTP 5xx, 429) trigger a fallback; a 4xx fails
   * fast. The result's `provider` field tells you which provider to route
   * verify/refund/webhooks to for this transaction.
   */
  initialize(params: InitializeParams): Promise<FallbackInitializeResult>;
  verify(provider: ProviderName, reference: string): Promise<VerifyResult>;
  refund(
    provider: ProviderName,
    reference: string,
    options?: RefundOptions,
  ): Promise<RefundResult>;
  /**
   * Send a payout via a specific provider. Transfers are deliberately NOT
   * auto-retried across providers - re-sending money after a timeout risks a
   * double payout, so you must name the provider and reconcile by reference.
   */
  transfer(provider: ProviderName, params: TransferParams): Promise<TransferResult>;
  /**
   * Resolve an account via a specific provider. Bank codes are provider-specific,
   * so use the same provider you listed the bank from.
   */
  resolveAccount(
    provider: ProviderName,
    params: ResolveAccountParams,
  ): Promise<ResolvedAccount>;
  /** List a specific provider's supported banks. */
  listBanks(provider: ProviderName, options?: ListBanksOptions): Promise<Bank[]>;
  webhooks: {
    construct(provider: ProviderName, rawBody: string, signature: string): WebhookEvent;
  };
  /** Access the underlying single-provider client (e.g. after fallback routing). */
  client(provider: ProviderName): PayClient;
}
