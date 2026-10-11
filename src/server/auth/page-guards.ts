import "server-only";

import { notFound, redirect } from "next/navigation";

import type { Actor } from "@/server/domain/actor";
import { type AccessLevel, checkAccess } from "@/server/domain/policies";
import { safeNextPath } from "@/server/domain/safe-redirect";

import { getCurrentActor } from "./session";

/**
 * Server-side protection for pages (PRD "protected routes"). The proxy's cookie-presence redirect is
 * only a UX shortcut; this is the real check, using the same policy as the API.
 *  - signed out (or unverified) → sign-in, returning here afterwards
 *  - suspended → sign-in with an explanation
 *  - signed in without the capability → 404, so the page's existence isn't revealed
 */
export async function requirePageAccess(
  level: Exclude<AccessLevel, "public">,
  currentPath: string,
): Promise<Actor> {
  const actor = await getCurrentActor();
  const decision = checkAccess(level, actor);
  if (decision.allowed) return actor!;

  switch (decision.reason) {
    case "UNAUTHENTICATED":
    case "EMAIL_NOT_VERIFIED":
      return redirect(`/sign-in?next=${encodeURIComponent(safeNextPath(currentPath))}`);
    case "ACCOUNT_SUSPENDED":
      return redirect("/sign-in?suspended=1");
    case "COURIER_NOT_APPROVED":
    case "FORBIDDEN":
      return notFound();
  }
}

/** On sign-in/sign-up pages: an active signed-in user goes straight to where they were heading. */
export async function redirectIfSignedIn(next: string): Promise<void> {
  const actor = await getCurrentActor();
  if (checkAccess("user", actor).allowed) redirect(next);
}

export function firstName(actor: Pick<Actor, "name">): string {
  return actor.name.trim().split(/\s+/)[0] ?? "Account";
}
