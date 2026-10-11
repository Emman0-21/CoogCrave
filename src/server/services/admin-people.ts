import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { type Database, type Transaction, getDb } from "@/server/db/client";
import { courierProfiles, deliveryAssignments, sessions, users } from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { decisionStopsDeliveries, moderationRefusal, nextCourierStatus } from "@/server/domain/admin-rules";
import { AppError } from "@/server/http/errors";
import type {
  AdminCourierView,
  AdminUserListView,
  AdminUsersQuery,
  AdminUserView,
  CourierDecisionInput,
  SuspendUserInput,
} from "@/shared/schemas/admin";
import type { CourierStatus } from "@/shared/enums";

import { recordAudit } from "./audit";
import { likePattern } from "./catalog";
import { notifyCourierDecision } from "./notifications";
import { decodeCursor, encodeCursor, microsecondTimestamp } from "./pagination";

/**
 * Admin decisions about people (PRD ADM-2, ADM-3): the user list, suspension, and courier decisions.
 * Every change is audited in the same transaction. Rules about what's allowed live in
 * domain/admin-rules.ts; this module reads, locks, and writes.
 *
 * Locking: decisions lock the courier profile row (FOR UPDATE). Accepting a delivery locks the same row
 * (FOR SHARE, in order-workflow.ts), so "suspend" and "accept" can't interleave: either the accept
 * finishes first and the suspension sees the active delivery, or the suspension wins and the accept
 * sees a courier who is offline and suspended.
 */

const USER_NOT_FOUND = () => new AppError("NOT_FOUND", "We couldn't find that user.");
const COURIER_NOT_FOUND = () => new AppError("NOT_FOUND", "We couldn't find that courier.");

const MODERATION_MESSAGES = {
  CANNOT_MODERATE_SELF: "You can't do this to your own account.",
  CANNOT_MODERATE_ADMIN: "Admins can't suspend other admins.",
} as const;

async function hasActiveDelivery(db: Transaction | Database, courierId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: deliveryAssignments.id })
    .from(deliveryAssignments)
    .where(and(eq(deliveryAssignments.courierId, courierId), isNull(deliveryAssignments.endedAt)));
  return Boolean(row);
}

const ACTIVE_DELIVERY = () =>
  new AppError(
    "ACTIVE_DELIVERY_IN_PROGRESS",
    "This courier is in the middle of a delivery. Unassign it or close it from the order page first.",
  );

// ── Users ────────────────────────────────────────────────────────────────────

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  emailVerified: users.emailVerified,
  suspendedAt: users.suspendedAt,
  courierStatus: courierProfiles.status,
  createdAt: users.createdAt,
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: AdminUserView["role"];
  emailVerified: boolean;
  suspendedAt: Date | null;
  courierStatus: CourierStatus | null;
  createdAt: Date;
};

function toUserView(row: UserRow): AdminUserView {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: row.emailVerified,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    courierStatus: row.courierStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

/** GET /api/v1/admin/users (PRD ADM-3): newest first, searchable by name or email. */
export async function listUsers(query: AdminUsersQuery, db: Database = getDb()): Promise<AdminUserListView> {
  const filters: SQL[] = [];
  if (query.q) {
    const pattern = likePattern(query.q);
    filters.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
  }
  if (query.role) filters.push(eq(users.role, query.role));
  if (query.suspended === "true") filters.push(isNotNull(users.suspendedAt));
  if (query.suspended === "false") filters.push(isNull(users.suspendedAt));
  if (query.cursor) {
    const { timestamp, id } = decodeCursor(query.cursor);
    filters.push(sql`(${users.createdAt}, ${users.id}) < (${timestamp}::timestamptz, ${id}::uuid)`);
  }

  const rows = await db
    .select({ ...userColumns, cursorTs: microsecondTimestamp(users.createdAt) })
    .from(users)
    .leftJoin(courierProfiles, eq(courierProfiles.userId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    data: page.map(toUserView),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.cursorTs, last.id) : null,
  };
}

/**
 * PATCH /api/v1/admin/users/{userId} (PRD ADM-3, THREAT_MODEL T-07). Suspending signs the person out
 * everywhere (their sessions are deleted) and takes them offline as a courier. Repeating a request that
 * matches the current state changes nothing and writes no audit row.
 */
export async function setUserSuspension(
  admin: Actor,
  userId: string,
  input: SuspendUserInput,
  requestId?: string,
  db: Database = getDb(),
): Promise<AdminUserView> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id, role: users.role, suspendedAt: users.suspendedAt })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!target) throw USER_NOT_FOUND();
    const refusal = moderationRefusal(admin.userId, target);
    if (refusal) throw new AppError(refusal, MODERATION_MESSAGES[refusal]);

    const alreadyThere = input.suspended === (target.suspendedAt !== null);
    if (!alreadyThere) {
      if (input.suspended) {
        const [courier] = await tx
          .select({ id: courierProfiles.id })
          .from(courierProfiles)
          .where(eq(courierProfiles.userId, userId))
          .for("update");
        if (courier) {
          if (await hasActiveDelivery(tx, courier.id)) throw ACTIVE_DELIVERY();
          await tx
            .update(courierProfiles)
            .set({ isOnline: false, onlineSince: null, updatedAt: new Date() })
            .where(eq(courierProfiles.id, courier.id));
        }
        await tx.delete(sessions).where(eq(sessions.userId, userId));
      }
      await tx
        .update(users)
        .set({ suspendedAt: input.suspended ? sql`now()` : null, updatedAt: new Date() })
        .where(eq(users.id, userId));
      await recordAudit(tx, {
        by: { kind: "ADMIN", actor: admin },
        action: input.suspended ? "user.suspend" : "user.unsuspend",
        targetType: "user",
        targetId: userId,
        metadata: { reason: input.reason },
        requestId,
      });
    }

    const [row] = await tx
      .select(userColumns)
      .from(users)
      .leftJoin(courierProfiles, eq(courierProfiles.userId, users.id))
      .where(eq(users.id, userId));
    return toUserView(row!);
  });
}

// ── Couriers ─────────────────────────────────────────────────────────────────

const reviewer = alias(users, "reviewer");

/** GET /api/v1/admin/couriers (PRD ADM-2): oldest application first, so the queue reads top to bottom. */
export async function listCouriers(
  status: CourierStatus | undefined,
  db: Database = getDb(),
): Promise<AdminCourierView[]> {
  return queryCouriers(status ? eq(courierProfiles.status, status) : undefined, db);
}

async function queryCouriers(where: SQL | undefined, db: Database): Promise<AdminCourierView[]> {
  const rows = await db
    .select({
      id: courierProfiles.id,
      userId: courierProfiles.userId,
      name: users.name,
      email: users.email,
      status: courierProfiles.status,
      transportMode: courierProfiles.transportMode,
      isOnline: courierProfiles.isOnline,
      appliedAt: courierProfiles.appliedAt,
      reviewedAt: courierProfiles.reviewedAt,
      reviewedBy: reviewer.name,
      reviewNote: courierProfiles.reviewNote,
    })
    .from(courierProfiles)
    .innerJoin(users, eq(users.id, courierProfiles.userId))
    .leftJoin(reviewer, eq(reviewer.id, courierProfiles.reviewedByUserId))
    .where(where)
    .orderBy(asc(courierProfiles.appliedAt), asc(courierProfiles.id))
    .limit(200);

  const ids = rows.map((r) => r.id);
  const stats = ids.length
    ? await db
        .select({
          courierId: deliveryAssignments.courierId,
          delivered: sql<number>`count(*) filter (where ${deliveryAssignments.endReason} = 'DELIVERED')::int`,
          active: sql<number>`count(*) filter (where ${deliveryAssignments.endedAt} is null)::int`,
        })
        .from(deliveryAssignments)
        .where(inArray(deliveryAssignments.courierId, ids))
        .groupBy(deliveryAssignments.courierId)
    : [];
  const byCourier = new Map(stats.map((s) => [s.courierId, s]));

  return rows.map((r) => ({
    ...r,
    appliedAt: r.appliedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    completedDeliveries: byCourier.get(r.id)?.delivered ?? 0,
    hasActiveDelivery: (byCourier.get(r.id)?.active ?? 0) > 0,
  }));
}

/** Count of applications waiting for a decision (dashboard and admin navigation). */
export async function pendingApplicationCount(db: Database = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(courierProfiles)
    .where(eq(courierProfiles.status, "PENDING"));
  return row?.n ?? 0;
}

/**
 * POST /api/v1/admin/couriers/{courierId}/decision (PRD ADM-2). Approve or reject a pending
 * application, suspend an approved courier, or reinstate a suspended one. The courier is notified and
 * the decision audited. Suspending a courier mid-delivery is refused until that delivery is resolved.
 */
export async function decideCourier(
  admin: Actor,
  courierId: string,
  input: CourierDecisionInput,
  requestId?: string,
  db: Database = getDb(),
): Promise<AdminCourierView> {
  await db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ id: courierProfiles.id, userId: courierProfiles.userId, status: courierProfiles.status })
      .from(courierProfiles)
      .where(eq(courierProfiles.id, courierId))
      .for("update");
    if (!profile) throw COURIER_NOT_FOUND();
    // Approving your own application would be self-dealing.
    if (profile.userId === admin.userId) {
      throw new AppError("CANNOT_MODERATE_SELF", MODERATION_MESSAGES.CANNOT_MODERATE_SELF);
    }

    const next = nextCourierStatus(profile.status, input.decision);
    if (!next) {
      throw new AppError(
        "INVALID_TRANSITION",
        `This courier is ${profile.status.toLowerCase()}, so that decision doesn't apply.`,
        { currentStatus: profile.status },
      );
    }
    if (decisionStopsDeliveries(input.decision) && (await hasActiveDelivery(tx, profile.id))) {
      throw ACTIVE_DELIVERY();
    }

    await tx
      .update(courierProfiles)
      .set({
        status: next,
        reviewedAt: sql`now()`,
        reviewedByUserId: admin.userId,
        reviewNote: input.note,
        // Anyone who isn't approved goes offline (also enforced by a CHECK constraint).
        ...(next === "APPROVED" ? {} : { isOnline: false, onlineSince: null }),
        updatedAt: new Date(),
      })
      .where(and(eq(courierProfiles.id, profile.id), eq(courierProfiles.status, profile.status)));

    await notifyCourierDecision(tx, profile.userId, next);
    await recordAudit(tx, {
      by: { kind: "ADMIN", actor: admin },
      action: `courier.${input.decision.toLowerCase()}`,
      targetType: "courier",
      targetId: profile.id,
      metadata: { from: profile.status, to: next, ...(input.note ? { note: input.note } : {}) },
      requestId,
    });
  });

  const [view] = await queryCouriers(eq(courierProfiles.id, courierId), db);
  return view!;
}
