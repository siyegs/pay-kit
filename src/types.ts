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
  webhooks: {
    /**
     * Verify a raw webhook body against its signature header and return a
     * normalized event. Throws PayKitError("invalid_signature") on mismatch.
     */
    construct(rawBody: string, signature: string): WebhookEvent;
  };
}
