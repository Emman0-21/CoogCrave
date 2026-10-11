import type { Actor } from "./actor";

/**
 * Delivery rules (PRD §6 rules 2 and 4, DLV-5…7). Pure functions: the services supply the facts, these
 * decide. Think of them as the dispatcher's checklist pinned above the desk.
 */

/** Simulated courier earnings for one delivery: the delivery fee plus 100% of the tip (PRD §6 rule 2). */
export function payoutFor(order: { deliveryFeeCents: number; tipCents: number }): number {
  // Callers often pass a whole order row; only these two fields matter.
  for (const [name, value] of [
    ["deliveryFeeCents", order.deliveryFeeCents],
    ["tipCents", order.tipCents],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be non-negative integer cents (got ${value}).`);
    }
  }
  return order.deliveryFeeCents + order.tipCents;
}

export type AcceptRefusal =
  | "COURIER_NOT_APPROVED"
  | "COURIER_OFFLINE"
  | "CANNOT_ACCEPT_OWN_ORDER"
  | "COURIER_HAS_ACTIVE_DELIVERY"
  | "OFFER_UNAVAILABLE";

/**
 * May this courier accept this order right now (PRD §6 rule 4)? Checked in this order so the most
 * fundamental problem is reported: approval → online → own order → already busy → order state.
 * Suspension and email verification are enforced earlier, by the route's access level.
 */
export function acceptRefusal(
  courier: NonNullable<Actor["courier"]> & { hasActiveDelivery: boolean },
  courierUserId: string,
  order: { status: string; customerId: string },
): AcceptRefusal | null {
  if (courier.status !== "APPROVED") return "COURIER_NOT_APPROVED";
  if (!courier.isOnline) return "COURIER_OFFLINE";
  if (order.customerId === courierUserId) return "CANNOT_ACCEPT_OWN_ORDER";
  if (courier.hasActiveDelivery) return "COURIER_HAS_ACTIVE_DELIVERY";
  if (order.status !== "READY_FOR_PICKUP") return "OFFER_UNAVAILABLE";
  return null;
}

/**
 * The name a courier sees for a customer (PRD DLV-7): the customer's chosen display name if they set
 * one, otherwise first name and last initial ("Alex R."). Never the full name or email.
 */
export function customerNameForCourier(displayName: string | null, fullName: string): string {
  if (displayName?.trim()) return displayName.trim();
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Customer";
  const first = words[0]!;
  const last = words.length > 1 ? words.at(-1)! : "";
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

/** First word of a name, for showing the courier to the customer ("Jordan"). */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "Your courier";
}

/** How long after a delivery ends its courier may still open the order (API_SPEC §7.1). */
export const COURIER_ACCESS_AFTER_END_MS = 24 * 60 * 60 * 1000;

/** Delivery instructions are shown to the courier only while the delivery is active (THREAT_MODEL T-05). */
export function courierCanSeeInstructions(assignment: { endedAt: Date | null }): boolean {
  return assignment.endedAt === null;
}

/** Whether a courier may still open an order they delivered or released. */
export function courierCanViewOrder(assignment: { endedAt: Date | null }, now: Date): boolean {
  return (
    assignment.endedAt === null || now.getTime() - assignment.endedAt.getTime() <= COURIER_ACCESS_AFTER_END_MS
  );
}
