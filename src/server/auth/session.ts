import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { getDb } from "@/server/db/client";
import { courierProfiles, users } from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";

import { getAuth } from "./auth";

/**
 * Resolves the signed-in Actor from request headers. Better Auth validates the session cookie and its
 * expiry; role, suspension, and courier status are then read fresh from the database, never from the
 * session payload or the client.
 */
export async function getActorFromHeaders(requestHeaders: Headers): Promise<Actor | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const [row] = await getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      emailVerified: users.emailVerified,
      suspendedAt: users.suspendedAt,
      courierId: courierProfiles.id,
      courierStatus: courierProfiles.status,
      courierOnline: courierProfiles.isOnline,
    })
    .from(users)
    .leftJoin(courierProfiles, eq(courierProfiles.userId, users.id))
    .where(eq(users.id, session.user.id));
  if (!row) return null;

  return {
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: row.emailVerified,
    suspended: row.suspendedAt !== null,
    courier:
      row.courierId && row.courierStatus
        ? { id: row.courierId, status: row.courierStatus, isOnline: row.courierOnline ?? false }
        : null,
  };
}

/** For Server Components and pages: the Actor for the current request, or null. */
export async function getCurrentActor(): Promise<Actor | null> {
  return getActorFromHeaders(await headers());
}
