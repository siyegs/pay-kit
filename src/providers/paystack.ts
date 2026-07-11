import { createHmac } from "node:crypto";
import { PayKitError } from "../errors";
import { providerRequest, safeEqual } from "../internal";
import type {
  InitializeParams,
  InitializeResult,
  PaymentProvider,
  PaymentStatus,
  ProviderContext,
  VerifyResult,
  WebhookEvent,
  WebhookEventType,
} from "../types";

const PAYSTACK_BASE = "https://api.paystack.co";

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

function mapEventType(event: unknown): WebhookEventType {
  return typeof event === "string" && event.length > 0 ? event : "unknown";
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
