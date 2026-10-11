import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";

import { type Database, getDb } from "@/server/db/client";
import { campusLocations, courierProfiles, notifications, userProfiles, users } from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { AppError } from "@/server/http/errors";
import type { MeResponse, UpdateProfileInput } from "@/shared/schemas/profile";

/** GET /api/v1/me: the signed-in user's own account. Only ever reads the actor's own rows. */
export async function getMe(actor: Actor, db: Database = getDb()): Promise<MeResponse> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      displayName: userProfiles.displayName,
      defaultLocationId: userProfiles.defaultLocationId,
      courierId: courierProfiles.id,
      courierStatus: courierProfiles.status,
      courierOnline: courierProfiles.isOnline,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(courierProfiles, eq(courierProfiles.userId, users.id))
    .where(eq(users.id, actor.userId));
  if (!row) throw new AppError("NOT_FOUND", "Account not found.");

  const [unread] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role,
    profile: { displayName: row.displayName ?? null, defaultLocationId: row.defaultLocationId ?? null },
    courier:
      row.courierId && row.courierStatus
        ? { id: row.courierId, status: row.courierStatus, isOnline: row.courierOnline ?? false }
        : null,
    unreadNotifications: unread?.value ?? 0,
  };
}

/**
 * PATCH /api/v1/me: display name and default drop point (PRD AUTH-8). The profile row is created on
 * first save. A default location must be an active drop point, or the request fails with INVALID_LOCATION.
 */
export async function updateMe(
  actor: Actor,
  input: UpdateProfileInput,
  db: Database = getDb(),
): Promise<MeResponse> {
  if (input.defaultLocationId) {
    const [location] = await db
      .select({ id: campusLocations.id })
      .from(campusLocations)
      .where(
        and(
          eq(campusLocations.id, input.defaultLocationId),
          eq(campusLocations.isDropPoint, true),
          isNull(campusLocations.deletedAt),
        ),
      );
    if (!location) throw new AppError("INVALID_LOCATION", "Choose a delivery building from the list.");
  }

  const changes: Partial<typeof userProfiles.$inferInsert> = {};
  if (input.displayName !== undefined) changes.displayName = input.displayName;
  if (input.defaultLocationId !== undefined) changes.defaultLocationId = input.defaultLocationId;

  await db
    .insert(userProfiles)
    .values({ userId: actor.userId, ...changes })
    .onConflictDoUpdate({ target: userProfiles.userId, set: changes });

  return getMe(actor, db);
}
