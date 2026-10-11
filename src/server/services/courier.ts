import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";

import { type Database, getDb } from "@/server/db/client";
import {
  campuses,
  campusLocations,
  courierProfiles,
  deliveryAssignments,
  deliveryOfferDeclines,
  orderItems,
  orders,
  restaurants,
  reviews,
} from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { payoutFor } from "@/server/domain/delivery";
import { AppError } from "@/server/http/errors";
import type {
  CourierApplicationInput,
  CourierOrderView,
  CourierProfileView,
  DeliverySummaryView,
  EarningsView,
  OfferView,
} from "@/shared/schemas/delivery";

import { loadCourierOrder } from "./orders";

/**
 * Courier features (PRD DLV-1…11). Approval itself is an admin decision (Phase 6); until then the demo
 * seed provides an approved courier. Earnings are SIMULATED: nobody is paid.
 */

function approvedCourier(actor: Actor): NonNullable<Actor["courier"]> {
  // The route's "courier" access level already guarantees this; checked again so services stand alone.
  if (!actor.courier || actor.courier.status !== "APPROVED") {
    throw new AppError("COURIER_NOT_APPROVED", "This needs an approved courier account.");
  }
  return actor.courier;
}

function toProfileView(row: typeof courierProfiles.$inferSelect): CourierProfileView {
  return {
    id: row.id,
    status: row.status,
    transportMode: row.transportMode,
    isOnline: row.isOnline,
    onlineSince: row.onlineSince?.toISOString() ?? null,
    appliedAt: row.appliedAt.toISOString(),
    reviewNote: row.reviewNote,
  };
}

/** GET /api/v1/courier/me: the caller's courier profile, or 404 if they never applied. */
export async function getCourierProfile(actor: Actor, db: Database = getDb()): Promise<CourierProfileView> {
  const [row] = await db.select().from(courierProfiles).where(eq(courierProfiles.userId, actor.userId));
  if (!row) throw new AppError("NOT_FOUND", "You haven't applied to deliver yet.");
  return toProfileView(row);
}

/**
 * POST /api/v1/courier/application (PRD DLV-1). Status is always PENDING: nothing a student sends can
 * approve them. A rejected applicant may apply again; anyone else with a profile gets 409.
 */
export async function applyAsCourier(
  actor: Actor,
  input: CourierApplicationInput,
  db: Database = getDb(),
): Promise<CourierProfileView> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(courierProfiles)
      .where(eq(courierProfiles.userId, actor.userId))
      .for("update");
    const now = new Date();
    if (existing && existing.status !== "REJECTED") {
      throw new AppError(
        "COURIER_APPLICATION_EXISTS",
        existing.status === "PENDING"
          ? "Your application is already waiting for review."
          : "You already have a courier profile.",
      );
    }
    const values = {
      status: "PENDING" as const,
      transportMode: input.transportMode,
      guidelinesAcceptedAt: now,
      appliedAt: now,
      isOnline: false,
      onlineSince: null,
      reviewedAt: null,
      reviewedByUserId: null,
      reviewNote: null,
      updatedAt: now,
    };
    const [row] = existing
      ? await tx.update(courierProfiles).set(values).where(eq(courierProfiles.id, existing.id)).returning()
      : await tx
          .insert(courierProfiles)
          .values({ userId: actor.userId, ...values })
          .onConflictDoNothing({ target: courierProfiles.userId })
          .returning();
    // Two first applications at once: the second insert does nothing and reports the duplicate.
    if (!row)
      throw new AppError("COURIER_APPLICATION_EXISTS", "Your application is already waiting for review.");
    return toProfileView(row);
  });
}

/** PUT /api/v1/courier/availability (PRD DLV-2). Going offline never affects an active delivery. */
export async function setAvailability(
  actor: Actor,
  online: boolean,
  db: Database = getDb(),
): Promise<{ isOnline: boolean; onlineSince: string | null }> {
  const courier = approvedCourier(actor);
  const [row] = await db
    .update(courierProfiles)
    .set({
      isOnline: online,
      // Keep the original time if already online, so the "online since" clock doesn't reset.
      onlineSince: online ? sql`coalesce(${courierProfiles.onlineSince}, now())` : null,
      updatedAt: new Date(),
    })
    .where(and(eq(courierProfiles.id, courier.id), eq(courierProfiles.status, "APPROVED")))
    .returning({ isOnline: courierProfiles.isOnline, onlineSince: courierProfiles.onlineSince });
  if (!row) throw new AppError("COURIER_NOT_APPROVED", "This needs an approved courier account.");
  return { isOnline: row.isOnline, onlineSince: row.onlineSince?.toISOString() ?? null };
}

const pickupLocation = campusLocations;

/**
 * GET /api/v1/courier/offers (PRD DLV-3, THREAT_MODEL T-05): orders ready for pickup, oldest first,
 * minus ones this courier declined and their own. Only what's needed to decide: no customer name,
 * no instructions, and no prices except the simulated payout.
 */
export async function listOffers(actor: Actor, db: Database = getDb()): Promise<OfferView[]> {
  const courier = approvedCourier(actor);
  if (!courier.isOnline) throw new AppError("COURIER_OFFLINE", "Go online to see deliveries.");

  const declined = db
    .select({ orderId: deliveryOfferDeclines.orderId })
    .from(deliveryOfferDeclines)
    .where(
      and(eq(deliveryOfferDeclines.orderId, orders.id), eq(deliveryOfferDeclines.courierId, courier.id)),
    );

  const rows = await db
    .select({
      orderId: orders.id,
      restaurantName: orders.restaurantNameSnapshot,
      pickupLocation: pickupLocation.name,
      dropLocation: orders.deliveryLocationSnapshot,
      readySince: orders.statusUpdatedAt,
      deliveryFeeCents: orders.deliveryFeeCents,
      tipCents: orders.tipCents,
    })
    .from(orders)
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .innerJoin(pickupLocation, eq(pickupLocation.id, restaurants.locationId))
    .where(
      and(eq(orders.status, "READY_FOR_PICKUP"), ne(orders.customerId, actor.userId), notExists(declined)),
    )
    .orderBy(asc(orders.statusUpdatedAt), asc(orders.id))
    .limit(50);

  const counts = rows.length
    ? await db
        .select({ orderId: orderItems.orderId, items: sql<number>`sum(${orderItems.quantity})::int` })
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            rows.map((r) => r.orderId),
          ),
        )
        .groupBy(orderItems.orderId)
    : [];
  const itemCount = new Map(counts.map((c) => [c.orderId, c.items]));

  return rows.map((r) => ({
    orderId: r.orderId,
    restaurantName: r.restaurantName,
    pickupLocation: r.pickupLocation,
    dropLocation: r.dropLocation,
    itemCount: itemCount.get(r.orderId) ?? 0,
    readySince: r.readySince.toISOString(),
    estimatedPayoutCents: payoutFor(r),
    payoutIsSimulated: true,
  }));
}

/** POST /api/v1/courier/offers/{orderId}/decline (PRD DLV-4). Idempotent; only for current offers. */
export async function declineOffer(actor: Actor, orderId: string, db: Database = getDb()): Promise<void> {
  const courier = approvedCourier(actor);
  const [offer] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(eq(orders.id, orderId), eq(orders.status, "READY_FOR_PICKUP"), ne(orders.customerId, actor.userId)),
    );
  if (!offer) throw new AppError("NOT_FOUND", "That delivery isn't available.");
  await db.insert(deliveryOfferDeclines).values({ orderId, courierId: courier.id }).onConflictDoNothing();
}

/** GET /api/v1/courier/deliveries/active: the courier's current delivery, or null. */
export async function getActiveDelivery(
  actor: Actor,
  db: Database = getDb(),
): Promise<CourierOrderView | null> {
  const courier = approvedCourier(actor);
  const [active] = await db
    .select({ orderId: deliveryAssignments.orderId })
    .from(deliveryAssignments)
    .where(and(eq(deliveryAssignments.courierId, courier.id), isNull(deliveryAssignments.endedAt)));
  return active ? loadCourierOrder(db, active.orderId, courier.id) : null;
}

/** GET /api/v1/courier/deliveries (PRD DLV-10): this courier's assignments, newest first. */
export async function listDeliveries(
  actor: Actor,
  limit: number,
  db: Database = getDb(),
): Promise<DeliverySummaryView[]> {
  const courier = approvedCourier(actor);
  const rows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      restaurantName: orders.restaurantNameSnapshot,
      dropLocation: orders.deliveryLocationSnapshot,
      assignedAt: deliveryAssignments.assignedAt,
      endedAt: deliveryAssignments.endedAt,
      endReason: deliveryAssignments.endReason,
      payoutCents: deliveryAssignments.payoutCents,
    })
    .from(deliveryAssignments)
    .innerJoin(orders, eq(orders.id, deliveryAssignments.orderId))
    .where(eq(deliveryAssignments.courierId, courier.id))
    .orderBy(desc(deliveryAssignments.assignedAt), desc(deliveryAssignments.id))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    assignedAt: r.assignedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
  }));
}

/**
 * GET /api/v1/courier/earnings (PRD DLV-10, DLV-11). SIMULATED: totals of the payout recorded at each
 * delivery. "Today" and "this week" (Monday start) use the campus time zone, not the server's.
 */
export async function getEarnings(actor: Actor, db: Database = getDb()): Promise<EarningsView> {
  const courier = approvedCourier(actor);
  const localEnded = sql`(${deliveryAssignments.endedAt} at time zone ${campuses.timezone})`;
  const localNow = sql`(now() at time zone ${campuses.timezone})`;
  const [totals] = await db
    .select({
      allTime: sql<number>`coalesce(sum(${deliveryAssignments.payoutCents}), 0)::int`,
      today: sql<number>`coalesce(sum(${deliveryAssignments.payoutCents}) filter (where ${localEnded}::date = ${localNow}::date), 0)::int`,
      week: sql<number>`coalesce(sum(${deliveryAssignments.payoutCents}) filter (where date_trunc('week', ${localEnded}) = date_trunc('week', ${localNow})), 0)::int`,
      completed: count(),
    })
    .from(deliveryAssignments)
    .innerJoin(orders, eq(orders.id, deliveryAssignments.orderId))
    .innerJoin(campuses, eq(campuses.id, orders.campusId))
    .where(
      and(eq(deliveryAssignments.courierId, courier.id), eq(deliveryAssignments.endReason, "DELIVERED")),
    );
  const [rating] = await db
    .select({ average: sql<string | null>`avg(${reviews.rating})`, ratings: count() })
    .from(reviews)
    .where(eq(reviews.courierId, courier.id));

  return {
    simulated: true,
    todayCents: totals?.today ?? 0,
    weekCents: totals?.week ?? 0,
    allTimeCents: totals?.allTime ?? 0,
    completedDeliveries: totals?.completed ?? 0,
    averageRating: rating?.average ? Math.round(Number(rating.average) * 10) / 10 : null,
    ratingsCount: rating?.ratings ?? 0,
  };
}
