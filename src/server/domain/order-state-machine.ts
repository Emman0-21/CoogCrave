import type { ActorType, OrderStatus } from "@/shared/enums";

/**
 * The order workflow as data (docs/ARCHITECTURE.md §6). Every status change anywhere in the app is
 * checked against this table by one service function, transitionOrder(). Think of it as a board game's
 * rulebook: each row is a legal move and who may make it; anything not listed is illegal.
 *
 * Relationship guards ("the *assigned* courier", "not their own order") need the database and live in the
 * service. This module answers only: is this move legal for this kind of actor, and is a reason needed?
 */

export interface TransitionRule {
  id: `T${number}`;
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly ActorType[];
  /** Actors who must give a reason for this move. */
  reasonRequiredFor: readonly ActorType[];
}

export const TRANSITIONS: readonly TransitionRule[] = [
  { id: "T1", from: "PLACED", to: "CONFIRMED", actors: ["RESTAURANT_SIM"], reasonRequiredFor: [] },
  {
    id: "T2",
    from: "PLACED",
    to: "CANCELLED",
    actors: ["CUSTOMER", "RESTAURANT_SIM", "ADMIN"],
    reasonRequiredFor: ["RESTAURANT_SIM", "ADMIN"],
  },
  { id: "T3", from: "CONFIRMED", to: "READY_FOR_PICKUP", actors: ["RESTAURANT_SIM"], reasonRequiredFor: [] },
  {
    id: "T4",
    from: "CONFIRMED",
    to: "CANCELLED",
    actors: ["RESTAURANT_SIM", "ADMIN"],
    reasonRequiredFor: ["RESTAURANT_SIM", "ADMIN"],
  },
  { id: "T5", from: "READY_FOR_PICKUP", to: "ASSIGNED", actors: ["COURIER"], reasonRequiredFor: [] },
  { id: "T6", from: "READY_FOR_PICKUP", to: "CANCELLED", actors: ["ADMIN"], reasonRequiredFor: ["ADMIN"] },
  {
    id: "T7",
    from: "ASSIGNED",
    to: "READY_FOR_PICKUP",
    actors: ["COURIER", "ADMIN"],
    reasonRequiredFor: ["COURIER", "ADMIN"],
  },
  { id: "T8", from: "ASSIGNED", to: "PICKED_UP", actors: ["COURIER"], reasonRequiredFor: [] },
  { id: "T9", from: "ASSIGNED", to: "CANCELLED", actors: ["ADMIN"], reasonRequiredFor: ["ADMIN"] },
  { id: "T10", from: "PICKED_UP", to: "DELIVERED", actors: ["COURIER"], reasonRequiredFor: [] },
  {
    id: "T11",
    from: "PICKED_UP",
    to: "DELIVERY_FAILED",
    actors: ["COURIER", "ADMIN"],
    reasonRequiredFor: ["COURIER", "ADMIN"],
  },
];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses a customer thinks of as "in progress" (order history's Active tab). */
export function isActive(status: OrderStatus): boolean {
  return !isTerminal(status);
}

export type TransitionDecision =
  | { allowed: true; rule: TransitionRule }
  | { allowed: false; code: "INVALID_TRANSITION" | "REASON_REQUIRED" };

/**
 * Is `from → to` legal for this actor type? A reason counts only if it has non-whitespace text.
 * SYSTEM appears in no row on purpose: automated changes (demo auto-advance) act as RESTAURANT_SIM.
 */
export function checkTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: ActorType,
  reason?: string | null,
): TransitionDecision {
  const rule = TRANSITIONS.find((t) => t.from === from && t.to === to && t.actors.includes(actor));
  if (!rule) return { allowed: false, code: "INVALID_TRANSITION" };
  if (rule.reasonRequiredFor.includes(actor) && !reason?.trim()) {
    return { allowed: false, code: "REASON_REQUIRED" };
  }
  return { allowed: true, rule };
}

/** Moves this actor type may make from a status: drives which buttons the UI shows. */
export function allowedTransitions(from: OrderStatus, actor: ActorType): OrderStatus[] {
  return TRANSITIONS.filter((t) => t.from === from && t.actors.includes(actor)).map((t) => t.to);
}
