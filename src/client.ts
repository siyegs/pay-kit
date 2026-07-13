import { randomUUID } from "node:crypto";
import { PayKitError } from "./errors";
import { createPaystackProvider } from "./providers/paystack";
import { createFlutterwaveProvider } from "./providers/flutterwave";
import type {
  PayClient,
  PayClientConfig,
  PaymentProvider,
  ProviderContext,
} from "./types";

function resolveProvider(config: PayClientConfig, ctx: ProviderContext): PaymentProvider {
  switch (config.provider) {
    case "paystack":
      return createPaystackProvider(ctx);
    case "flutterwave":
      return createFlutterwaveProvider(ctx);
    default:
      throw new PayKitError(`Unknown provider: ${String(config.provider)}`, {
        code: "config_error",
      });
  }
}

/**
 * Create a payment client bound to a single provider.
 *
 * @example
 * const pay = createPayClient({ provider: "paystack", secretKey: process.env.PAYSTACK_SECRET_KEY! });
 * const { authorizationUrl, reference } = await pay.initialize({ amount: 500000, email: "a@b.com" });
 */
export function createPayClient(config: PayClientConfig): PayClient {
  if (!config.secretKey) {
    throw new PayKitError("`secretKey` is required", { code: "config_error" });
  }

  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new PayKitError(
      "No fetch implementation found. Use Node >= 18 or pass `config.fetch`.",
      { code: "config_error" },
    );
  }

  const ctx: ProviderContext = {
    secretKey: config.secretKey,
    webhookSecret: config.webhookSecret,
    baseUrl: config.baseUrl,
    fetch: fetchImpl,
    generateReference:
      config.generateReference ?? (() => `pk_${randomUUID().replace(/-/g, "")}`),
  };

  const provider = resolveProvider(config, ctx);

  return {
    provider: provider.name,
    initialize: (params) => provider.initialize(params),
    verify: (reference) => provider.verify(reference),
    refund: (reference, options) => provider.refund(reference, options),
    transfer: (params) => provider.transfer(params),
    resolveAccount: (params) => provider.resolveAccount(params),
    listBanks: (options) => provider.listBanks(options),
    webhooks: {
      construct: (rawBody, signature) => provider.constructWebhookEvent(rawBody, signature),
    },
  };
}
