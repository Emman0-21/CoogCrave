import type { Actor } from "./actor";

/**
 * Route-level access rules (docs/API_SPEC.md §1). These are a first filter; resource-level rules
 * (who may see which order) are separate policies added with those features.
 */
export const ACCESS_LEVELS = ["public", "user", "courier", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export type AccessDenial =
  "UNAUTHENTICATED" | "ACCOUNT_SUSPENDED" | "EMAIL_NOT_VERIFIED" | "COURIER_NOT_APPROVED" | "FORBIDDEN";

export type AccessDecision = { allowed: true } | { allowed: false; reason: AccessDenial };

const allow: AccessDecision = { allowed: true };
const deny = (reason: AccessDenial): AccessDecision => ({ allowed: false, reason });

/**
 * Checks run in a fixed order so the most fundamental problem is reported first:
 * signed in → not suspended → email verified → capability (courier approval or admin role).
 */
export function checkAccess(level: AccessLevel, actor: Actor | null): AccessDecision {
  if (level === "public") return allow;
  if (!actor) return deny("UNAUTHENTICATED");
  if (actor.suspended) return deny("ACCOUNT_SUSPENDED");
  if (!actor.emailVerified) return deny("EMAIL_NOT_VERIFIED");

  switch (level) {
    case "user":
      return allow;
    case "courier":
      return actor.courier?.status === "APPROVED" ? allow : deny("COURIER_NOT_APPROVED");
    case "admin":
      return actor.role === "ADMIN" ? allow : deny("FORBIDDEN");
  }
}
