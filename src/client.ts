import { randomUUID } from "node:crypto";
import { PayKitError } from "./errors";
import { createPaystackProvider } from "./providers/paystack";
import { createFlutterwaveProvider } from "./providers/flutterwave";
import { createMockProvider } from "./providers/mock";
import type {
  PayClient,
  PayClientConfig,
  PaymentProvider,
  ProviderContext,
} from "./types";

/** Default per-request timeout - long enough for any healthy provider call. */
const DEFAULT_TIMEOUT_MS = 30_000;

function resolveProvider(config: PayClientConfig, ctx: ProviderContext): PaymentProvider {
  switch (config.provider) {
    case "paystack":
      return createPaystackProvider(ctx);
    case "flutterwave":
      return createFlutterwaveProvider(ctx);
    case "mock":
      return createMockProvider(ctx);
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
  const isMock = config.provider === "mock";

  // The mock provider needs no credentials and never touches the network.
  if (!isMock && !config.secretKey) {
    throw new PayKitError("`secretKey` is required", { code: "config_error" });
  }

  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!isMock && typeof fetchImpl !== "function") {
    throw new PayKitError(
      "No fetch implementation found. Use Node >= 18 or pass `config.fetch`.",
      { code: "config_error" },
    );
  }

  const ctx: ProviderContext = {
    secretKey: config.secretKey ?? "",
    webhookSecret: config.webhookSecret,
    baseUrl: config.baseUrl,
    fetch: fetchImpl,
    generateReference:
      config.generateReference ?? (() => `pk_${randomUUID().replace(/-/g, "")}`),
    timeoutMs: config.timeout ?? DEFAULT_TIMEOUT_MS,
  };

  const provider = resolveProvider(config, ctx);

  return {
    provider: provider.name,
    initialize: (params) => provider.initialize(params),
    verify: (reference) => provider.verify(reference),
    chargeAuthorization: (params) => provider.chargeAuthorization(params),
    refund: (reference, options) => provider.refund(reference, options),
    transfer: (params) => provider.transfer(params),
    verifyTransfer: (transferId) => provider.verifyTransfer(transferId),
    resolveAccount: (params) => provider.resolveAccount(params),
    listBanks: (options) => provider.listBanks(options),
    getBalances: () => provider.getBalances(),
    listTransactions: (options) => provider.listTransactions(options),
    createSubaccount: (params) => provider.createSubaccount(params),
    createPlan: (params) => provider.createPlan(params),
    listPlans: (options) => provider.listPlans(options),
    fetchPlan: (idOrCode) => provider.fetchPlan(idOrCode),
    updatePlan: (idOrCode, params) => provider.updatePlan(idOrCode, params),
    cancelPlan: (idOrCode) => provider.cancelPlan(idOrCode),
    createSubscription: (params) => provider.createSubscription(params),
    listSubscriptions: (options) => provider.listSubscriptions(options),
    fetchSubscription: (idOrCode) => provider.fetchSubscription(idOrCode),
    cancelSubscription: (idOrCode, params) => provider.cancelSubscription(idOrCode, params),
    enableSubscription: (idOrCode, params) => provider.enableSubscription(idOrCode, params),
    webhooks: {
      construct: (rawBody, signature) => provider.constructWebhookEvent(rawBody, signature),
    },
  };
}
