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
