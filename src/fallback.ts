import { createPayClient } from "./client";
import { PayKitError, isRetryableError } from "./errors";
import type {
  FallbackClient,
  FallbackClientConfig,
  FallbackInitializeResult,
  InitializeParams,
  PayClient,
  ProviderName,
} from "./types";

/**
 * Create a resilient client that tries multiple providers in order.
 *
 * `initialize` falls through to the next provider on outage-like failures
 * (network errors, HTTP 5xx/429) and returns the provider that succeeded.
 * Route `verify`/`refund`/`webhooks` for that transaction back to the same
 * provider - a charge started on Paystack can only be verified on Paystack.
 *
 * @example
 * const pay = createFallbackClient({
 *   providers: [
 *     { provider: "paystack", secretKey: process.env.PAYSTACK_SECRET_KEY! },
 *     { provider: "flutterwave", secretKey: process.env.FLW_SECRET_KEY! },
 *   ],
 * });
 * const { reference, provider } = await pay.initialize({ amount: 500000, email: "a@b.com" });
 * // persist { reference, provider }, then later:
 * const result = await pay.verify(provider, reference);
 */
export function createFallbackClient(config: FallbackClientConfig): FallbackClient {
  if (!config.providers || config.providers.length === 0) {
    throw new PayKitError("createFallbackClient requires at least one provider", {
      code: "config_error",
    });
  }

  const clients = new Map<ProviderName, PayClient>();
  const order: ProviderName[] = [];

  for (const entry of config.providers) {
    if (clients.has(entry.provider)) continue; // ignore duplicates, keep first
    clients.set(
      entry.provider,
      createPayClient({
        provider: entry.provider,
        secretKey: entry.secretKey,
        webhookSecret: entry.webhookSecret,
        baseUrl: entry.baseUrl,
        fetch: config.fetch,
        generateReference: config.generateReference,
      }),
    );
    order.push(entry.provider);
  }

  function getClient(provider: ProviderName): PayClient {
    const client = clients.get(provider);
    if (!client) {
      throw new PayKitError(
        `Provider "${provider}" is not configured on this fallback client`,
        { code: "config_error" },
      );
    }
    return client;
  }

  return {
    async initialize(params: InitializeParams): Promise<FallbackInitializeResult> {
      let lastError: unknown;
      for (const provider of order) {
        try {
          const result = await getClient(provider).initialize(params);
          return { ...result, provider };
        } catch (err) {
          lastError = err;
          // A client error (4xx) would fail the same way everywhere - stop.
          if (!isRetryableError(err)) throw err;
          // Otherwise fall through to the next provider.
        }
      }
      throw (
        lastError ??
        new PayKitError("All providers failed to initialize the payment", {
          code: "provider_error",
        })
      );
    },

    verify: (provider, reference) => getClient(provider).verify(reference),

    refund: (provider, reference, options) => getClient(provider).refund(reference, options),

    // Payouts are single-provider on purpose - retrying a transfer across
    // providers could pay the recipient twice. Name the provider explicitly.
    transfer: (provider, params) => getClient(provider).transfer(params),

    verifyTransfer: (provider, transferId) => getClient(provider).verifyTransfer(transferId),

    // Bank codes are provider-specific, so resolve/list against a named provider.
    resolveAccount: (provider, params) => getClient(provider).resolveAccount(params),

    listBanks: (provider, options) => getClient(provider).listBanks(options),

    webhooks: {
      construct: (provider, rawBody, signature) =>
        getClient(provider).webhooks.construct(rawBody, signature),
    },

    client: getClient,
  };
}
