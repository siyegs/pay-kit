export type PayKitErrorCode =
  | "provider_error"
  | "network_error"
  | "invalid_signature"
  | "config_error"
  | "verification_failed";

export interface PayKitErrorOptions {
  code: PayKitErrorCode;
  provider?: string;
  statusCode?: number;
  raw?: unknown;
  cause?: unknown;
}

/**
 * Whether an error is worth retrying on another provider: network failures and
 * outage-like HTTP statuses (5xx, 429). Client errors (4xx) are not retryable -
 * they would fail the same way everywhere.
 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof PayKitError)) return false;
  if (err.code === "network_error") return true;
  if (typeof err.statusCode === "number") {
    return err.statusCode >= 500 || err.statusCode === 429;
  }
  return false;
}

/** Single error type surfaced by pay-kit, with a machine-readable `code`. */
export class PayKitError extends Error {
  readonly code: PayKitErrorCode;
  readonly provider?: string;
  readonly statusCode?: number;
  readonly raw?: unknown;

  constructor(message: string, options: PayKitErrorOptions) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "PayKitError";
    this.code = options.code;
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.raw = options.raw;
  }
}
