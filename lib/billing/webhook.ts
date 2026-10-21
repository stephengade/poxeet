import type { BachsEvent, CheckoutState } from "./bachs";
import { creditExpiry } from "./config";

// How payments become credits (PRD BILL-3, BILL-6, D-022). A payment is confirmed by asking Bachs for the
// checkout (server to server), never by trusting a redirect or an event's own amount: buyers may pay in another
// currency (NGN for a USD checkout), and the checkout's own amount and currency are what we compare. Two things
// trigger that check: the member coming back from checkout (/api/billing/return) and the collection.succeeded
// webhook. apply_payment credits each checkout once, whichever arrives first. refund.paid claws back through
// apply_refund. Both SQL functions record the event in billing_events and are safe to call again.

/** The one database call this needs, so tests can pass a fake. The admin Supabase client fits. */
export type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export type EventOutcome =
  | { result: "credited"; checkoutId: string }
  | { result: "refunded"; chargeId: string; credits: number }
  | { result: "duplicate" }
  /** Bachs hasn't marked the checkout paid yet: ask again later. */
  | { result: "pending" }
  /** Not ours or not actionable: answer 2xx so Bachs stops retrying. */
  | { result: "ignored"; reason: string };

const text = (value: unknown) => (typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null);

/** Reads a checkout from Bachs. lib/billing/bachs.ts getCheckout in the app; a fake in tests. */
export type CheckoutLookup = (checkoutId: string) => Promise<CheckoutState>;

/**
 * Asks Bachs whether a checkout is paid and, if so, credits it once. `eventId` names what triggered the check
 * (a webhook event id, or "return:<checkout id>"). Throws on a Bachs or database failure.
 */
export async function confirmCheckout(db: RpcClient, lookup: CheckoutLookup, checkoutId: string, eventId: string, eventType: string): Promise<EventOutcome> {
  const checkout = await lookup(checkoutId);
  if (!checkout.paid) return { result: "pending" };
  const { data: applied, error } = await db.rpc("apply_payment", {
    p_checkout_id: checkout.checkoutId, p_charge_id: checkout.chargeId ?? checkout.checkoutId, p_event_id: eventId, p_event_type: eventType,
    p_paid_amount: checkout.amount, p_currency: checkout.currency, p_expires_at: creditExpiry().toISOString(),
  });
  // 23503: a checkout this instance didn't create. 22023: the checkout's amount or currency differs from ours.
  if (error?.code === "23503") return { result: "ignored", reason: "unknown checkout" };
  if (error?.code === "22023") return { result: "ignored", reason: "checkout amount does not match" };
  if (error) throw new Error(`apply_payment failed: ${error.message}`);
  return applied ? { result: "credited", checkoutId: checkout.checkoutId } : { result: "duplicate" };
}

/** Throws on a Bachs or database failure, so the route answers 500 and Bachs retries the delivery. */
export async function handleBachsEvent(db: RpcClient, event: BachsEvent, lookup: CheckoutLookup): Promise<EventOutcome> {
  const data = event.data;

  if (event.type === "collection.succeeded") {
    const checkoutId = text(data.checkout_id);
    if (!checkoutId) return { result: "ignored", reason: "not a checkout payment" };
    return confirmCheckout(db, lookup, checkoutId, event.id, event.type);
  }

  if (event.type === "refund.paid") {
    const chargeId = text(data.charge_id);
    const refundId = text(data.refund_id) ?? event.id;
    const refunded = Number(text(data.refunded_amount) ?? text(data.requested_amount));
    if (!chargeId || !Number.isFinite(refunded) || refunded <= 0) return { result: "ignored", reason: "not a refund we can apply" };
    const { data: taken, error } = await db.rpc("apply_refund", {
      p_charge_id: chargeId, p_refund_id: refundId, p_event_id: event.id, p_event_type: event.type, p_refunded_amount: refunded,
    });
    if (error) throw new Error(`apply_refund failed: ${error.message}`);
    return typeof taken === "number" ? { result: "refunded", chargeId, credits: taken } : { result: "duplicate" };
  }

  return { result: "ignored", reason: `event ${event.type} is not used` };
}
