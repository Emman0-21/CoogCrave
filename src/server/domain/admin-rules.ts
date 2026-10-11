import type { CourierDecision } from "@/shared/schemas/admin";
import type { CourierStatus, UserRole } from "@/shared/enums";

/**
 * Pure rules for admin decisions about people (PRD ADM-2, ADM-3). No I/O: the services read the
 * current state, ask these functions, then write with compare-and-set.
 */

/** A status a decision can lead to (nobody is ever moved back to PENDING). */
export type DecidedCourierStatus = Exclude<CourierStatus, "PENDING">;

/** Which courier status each decision leads to, and the only status it may start from. */
const COURIER_DECISION_RULES: Record<CourierDecision, { from: CourierStatus; to: DecidedCourierStatus }> = {
  APPROVE: { from: "PENDING", to: "APPROVED" },
  REJECT: { from: "PENDING", to: "REJECTED" },
  SUSPEND: { from: "APPROVED", to: "SUSPENDED" },
  REINSTATE: { from: "SUSPENDED", to: "APPROVED" },
};

/** The status a decision moves a courier to, or null if it doesn't apply to their current status. */
export function nextCourierStatus(
  current: CourierStatus,
  decision: CourierDecision,
): DecidedCourierStatus | null {
  const rule = COURIER_DECISION_RULES[decision];
  return rule.from === current ? rule.to : null;
}

/** Decisions that make sense for a courier in this status (what the admin screen offers). */
export function courierDecisionsFor(current: CourierStatus): CourierDecision[] {
  return (Object.keys(COURIER_DECISION_RULES) as CourierDecision[]).filter(
    (decision) => COURIER_DECISION_RULES[decision].from === current,
  );
}

/** Taking a courier off the road needs their current delivery resolved first. */
export function decisionStopsDeliveries(decision: CourierDecision): boolean {
  return decision === "SUSPEND";
}

export type ModerationRefusal = "CANNOT_MODERATE_SELF" | "CANNOT_MODERATE_ADMIN";

/**
 * Admins can't suspend themselves (they'd lock themselves out mid-action) or another admin (one admin
 * shouldn't be able to remove the others; demoting admins is a command-line operation, not an API one).
 */
export function moderationRefusal(
  adminUserId: string,
  target: { id: string; role: UserRole },
): ModerationRefusal | null {
  if (target.id === adminUserId) return "CANNOT_MODERATE_SELF";
  if (target.role === "ADMIN") return "CANNOT_MODERATE_ADMIN";
  return null;
}
