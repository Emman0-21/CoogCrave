import "server-only";

import { and, asc, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";

import { type Database, type DbExecutor, getDb } from "@/server/db/client";
import {
  campusLocations,
  courierProfiles,
  deliveryAssignments,
  orderItemOptions,
  orderItems,
  orders,
  orderStatusEvents,
  payments,
  restaurants,
  users,
} from "@/server/db/schema";
import { allowedTransitions, checkTransition } from "@/server/domain/order-state-machine";
import type { AdminOrderListView, AdminOrdersQuery, AdminOrderView } from "@/shared/schemas/admin";

import { likePattern } from "./catalog";
import { decodeCursor, encodeCursor, microsecondTimestamp } from "./pagination";

/**
 * Orders as admins see them (PRD ADM-6, API_SPEC §7.1 "Admin" column): every order, with the customer's
 * name and email, who did what and why, each courier assignment, and the simulated payment. Admins'
 * own status changes go through the same referee as everyone else's (orders.ts → order-workflow.ts).
 */

/** GET /api/v1/admin/orders: newest first; filter by status, restaurant, or order number / customer email. */
export async function listAdminOrders(
  query: AdminOrdersQuery,
  db: Database = getDb(),
): Promise<AdminOrderListView> {
  const filters: SQL[] = [];
  if (query.status?.length) filters.push(inArray(orders.status, query.status));
  if (query.restaurantId) filters.push(eq(orders.restaurantId, query.restaurantId));
  if (query.q) {
    const pattern = likePattern(query.q);
    filters.push(
      or(ilike(orders.orderNumber, pattern), ilike(users.email, pattern), ilike(users.name, pattern))!,
    );
  }
  if (query.cursor) {
    const { timestamp, id } = decodeCursor(query.cursor);
    filters.push(sql`(${orders.createdAt}, ${orders.id}) < (${timestamp}::timestamptz, ${id}::uuid)`);
  }

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      restaurantName: orders.restaurantNameSnapshot,
      customerName: users.name,
      customerEmail: users.email,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      statusUpdatedAt: orders.statusUpdatedAt,
      cursorTs: microsecondTimestamp(orders.createdAt),
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.customerId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    data: page.map(({ cursorTs: _cursor, createdAt, statusUpdatedAt, ...row }) => ({
      ...row,
      createdAt: createdAt.toISOString(),
      statusUpdatedAt: statusUpdatedAt.toISOString(),
    })),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.cursorTs, last.id) : null,
  };
}

/** The admin projection of one order, or null if it doesn't exist. */
export async function loadAdminOrder(db: DbExecutor, orderId: string): Promise<AdminOrderView | null> {
  const [row] = await db
    .select({
      order: orders,
      restaurantSlug: restaurants.slug,
      pickupLocation: campusLocations.name,
      customerName: users.name,
      customerEmail: users.email,
    })
    .from(orders)
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .innerJoin(campusLocations, eq(campusLocations.id, restaurants.locationId))
    .innerJoin(users, eq(users.id, orders.customerId))
    .where(eq(orders.id, orderId));
  if (!row) return null;
  const o = row.order;

  const [items, events, assignments, [payment]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.id)),
    db
      .select({
        toStatus: orderStatusEvents.toStatus,
        fromStatus: orderStatusEvents.fromStatus,
        actorType: orderStatusEvents.actorType,
        actorId: orderStatusEvents.actorUserId,
        actorName: users.name,
        reason: orderStatusEvents.reason,
        createdAt: orderStatusEvents.createdAt,
      })
      .from(orderStatusEvents)
      .leftJoin(users, eq(users.id, orderStatusEvents.actorUserId))
      .where(eq(orderStatusEvents.orderId, o.id))
      .orderBy(asc(orderStatusEvents.createdAt), asc(orderStatusEvents.id)),
    db
      .select({
        courierId: deliveryAssignments.courierId,
        courierName: users.name,
        courierEmail: users.email,
        assignedAt: deliveryAssignments.assignedAt,
        pickedUpAt: deliveryAssignments.pickedUpAt,
        endedAt: deliveryAssignments.endedAt,
        endReason: deliveryAssignments.endReason,
        payoutCents: deliveryAssignments.payoutCents,
      })
      .from(deliveryAssignments)
      .innerJoin(courierProfiles, eq(courierProfiles.id, deliveryAssignments.courierId))
      .innerJoin(users, eq(users.id, courierProfiles.userId))
      .where(eq(deliveryAssignments.orderId, o.id))
      .orderBy(asc(deliveryAssignments.assignedAt), asc(deliveryAssignments.id)),
    db
      .select({
        status: payments.status,
        amountCents: payments.amountCents,
        reference: payments.providerReference,
      })
      .from(payments)
      .where(eq(payments.orderId, o.id)),
  ]);
  const options = items.length
    ? await db
        .select({ orderItemId: orderItemOptions.orderItemId, name: orderItemOptions.optionNameSnapshot })
        .from(orderItemOptions)
        .where(
          inArray(
            orderItemOptions.orderItemId,
            items.map((i) => i.id),
          ),
        )
        .orderBy(asc(orderItemOptions.id))
    : [];

  return {
    viewer: "ADMIN",
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    statusUpdatedAt: o.statusUpdatedAt.toISOString(),
    version: o.version,
    createdAt: o.createdAt.toISOString(),
    restaurant: {
      id: o.restaurantId,
      slug: row.restaurantSlug,
      name: o.restaurantNameSnapshot,
      pickupLocation: row.pickupLocation,
    },
    customer: { id: o.customerId, name: row.customerName, email: row.customerEmail },
    items: items.map((item) => ({
      name: item.nameSnapshot,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
      options: options.filter((opt) => opt.orderItemId === item.id).map((opt) => opt.name),
      specialInstructions: item.specialInstructions,
    })),
    price: {
      subtotalCents: o.subtotalCents,
      deliveryFeeCents: o.deliveryFeeCents,
      serviceFeeCents: o.serviceFeeCents,
      taxCents: o.taxCents,
      tipCents: o.tipCents,
      totalCents: o.totalCents,
    },
    deliveryLocation: { id: o.deliveryLocationId, name: o.deliveryLocationSnapshot },
    deliveryInstructions: o.deliveryInstructions,
    timeline: events.map((e) => ({
      status: e.toStatus,
      fromStatus: e.fromStatus,
      at: e.createdAt.toISOString(),
      actorType: e.actorType,
      actor: e.actorId && e.actorName ? { id: e.actorId, name: e.actorName } : null,
      reason: e.reason,
    })),
    assignments: assignments.map((a) => ({
      ...a,
      assignedAt: a.assignedAt.toISOString(),
      pickedUpAt: a.pickedUpAt?.toISOString() ?? null,
      endedAt: a.endedAt?.toISOString() ?? null,
    })),
    payment: payment ? { mode: "DEMO", ...payment } : null,
    allowedTransitions: allowedTransitions(o.status, "ADMIN").map((toStatus) => ({
      toStatus,
      reasonRequired: checkTransition(o.status, toStatus, "ADMIN").allowed === false,
    })),
  };
}

/** For the admin order page: the admin projection, or null if there's no such order. */
export function getAdminOrder(orderId: string, db: Database = getDb()): Promise<AdminOrderView | null> {
  return loadAdminOrder(db, orderId);
}
