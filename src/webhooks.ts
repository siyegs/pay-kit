import type {
  ChargeFailedEvent,
  ChargeSuccessEvent,
  TransferFailedEvent,
  TransferSuccessEvent,
  WebhookEvent,
} from "./types";

/**
 * Type guards that narrow a normalized {@link WebhookEvent} to a specific
 * variant. A plain `event.type === "charge.success"` check leaves the open
 * catch-all variant in the union (Paystack forwards arbitrary event names), so
 * these give you clean, precise narrowing instead:
 *
 * @example
 * const event = pay.webhooks.construct(rawBody, signature);
 * if (isChargeSuccess(event)) {
 *   // event.status is "success" here
 *   fulfilOrder(event.reference, event.amount);
 * }
 */

/** True for a successful charge (`charge.success`). */
export function isChargeSuccess(event: WebhookEvent): event is ChargeSuccessEvent {
  return event.type === "charge.success";
}

/** True for a failed charge (`charge.failed`). */
export function isChargeFailed(event: WebhookEvent): event is ChargeFailedEvent {
  return event.type === "charge.failed";
}

/** True for a settled payout (`transfer.success`). */
export function isTransferSuccess(event: WebhookEvent): event is TransferSuccessEvent {
  return event.type === "transfer.success";
}

/** True for a failed payout (`transfer.failed`). */
export function isTransferFailed(event: WebhookEvent): event is TransferFailedEvent {
  return event.type === "transfer.failed";
}
