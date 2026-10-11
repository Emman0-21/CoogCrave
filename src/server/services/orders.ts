import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, notInArray, or, type SQL, sql } from "drizzle-orm";

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
  userProfiles,
  users,
} from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import {
  COURIER_ACCESS_AFTER_END_MS,
  courierCanSeeInstructions,
  customerNameForCourier,
  firstNameOf,
  payoutFor,
} from "@/server/domain/delivery";
import { allowedTransitions, checkTransition, TERMINAL_STATUSES } from "@/server/domain/order-state-machine";
import { AppError } from "@/server/http/errors";
import type { AdminOrderView } from "@/shared/schemas/admin";
import type { CourierOrderView, KitchenOrderView } from "@/shared/schemas/delivery";
import type {
  OrderDetailView,
  OrderListQuery,
  OrderListView,
  TransitionInput,
} from "@/shared/schemas/ordering";

import { loadAdminOrder } from "./admin-orders";
import { loadKitchenOrder } from "./kitchen";
import { loadReview } from "./reviews";
import { transitionOrder } from "./order-workflow";
import { decodeCursor, encodeCursor, microsecondTimestamp } from "./pagination";

/**
 * Orders after placement: history, detail, and status changes (PRD ORD-7…9, TRK-1, DLV-7…9).
 *
 * Visibility (THREAT_MODEL T-01, T-05): the customer who placed an order sees the customer projection;
 * the courier assigned to it sees the courier projection while the delivery is active and for 24 hours
 * after; anyone else gets the same 404 as for an order that doesn't exist, so IDs can't be probed.
 * Admins see the admin projection of every order; the Kitchen Console has its own view.
 */

const NOT_FOUND = () => new AppError("NOT_FOUND", "We couldn't find that order.");

// ── Detail ───────────────────────────────────────────────────────────────────

/** Customer projection of one order (API_SPEC §7.1). `null` when the order isn't this customer's. */
export async function loadCustomerOrder(
  db: DbExecutor,
  orderId: string,
  customerId: string,
): Promise<OrderDetailView | null> {
  const [order] = await db
    .select({
      order: orders,
      restaurantSlug: restaurants.slug,
      pickupLocation: campusLocations.name,
    })
    .from(orders)
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .innerJoin(campusLocations, eq(campusLocations.id, restaurants.locationId))
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)));
  if (!order) return null;
  const o = order.order;

  const [items, events, [payment], [courier]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.id)),
    db
      .select({
        toStatus: orderStatusEvents.toStatus,
        actorType: orderStatusEvents.actorType,
        createdAt: orderStatusEvents.createdAt,
      })
      .from(orderStatusEvents)
      .where(eq(orderStatusEvents.orderId, o.id))
      .orderBy(asc(orderStatusEvents.createdAt), asc(orderStatusEvents.id)),
    db.select({ status: payments.status }).from(payments).where(eq(payments.orderId, o.id)),
    // The courier on the active assignment, or the one who delivered it.
    db
      .select({ name: users.name, transportMode: courierProfiles.transportMode })
      .from(deliveryAssignments)
      .innerJoin(courierProfiles, eq(courierProfiles.id, deliveryAssignments.courierId))
      .innerJoin(users, eq(users.id, courierProfiles.userId))
      .where(
        and(
          eq(deliveryAssignments.orderId, o.id),
          or(isNull(deliveryAssignments.endedAt), eq(deliveryAssignments.endReason, "DELIVERED")),
        ),
      )
      .limit(1),
  ]);
  const options = items.length
    ? await db
        .select()
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
    viewer: "CUSTOMER",
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    statusUpdatedAt: o.statusUpdatedAt.toISOString(),
    version: o.version,
    createdAt: o.createdAt.toISOString(),
    restaurant: {
      id: o.restaurantId,
      slug: order.restaurantSlug,
      name: o.restaurantNameSnapshot,
      pickupLocation: order.pickupLocation,
    },
    items: items.map((item) => ({
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      optionsTotalCents: item.optionsTotalCents,
      lineTotalCents: item.lineTotalCents,
      options: options
        .filter((opt) => opt.orderItemId === item.id)
        .map((opt) => ({
          group: opt.groupNameSnapshot,
          name: opt.optionNameSnapshot,
          priceDeltaCents: opt.priceDeltaCents,
        })),
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
      at: e.createdAt.toISOString(),
      actorType: e.actorType,
    })),
    payment: { mode: "DEMO", status: payment?.status ?? "AUTHORIZED" },
    courier: courier ? { firstName: firstNameOf(courier.name), transportMode: courier.transportMode } : null,
    review: await loadReview(db, o.id),
    allowedTransitions: allowedTransitions(o.status, "CUSTOMER").map((toStatus) => ({
      toStatus,
      actingAs: null,
      reasonRequired: checkTransition(o.status, toStatus, "CUSTOMER").allowed === false,
    })),
  };
}

/** The caller's own order, customer projection only (customer pages). */
export async function getOrder(
  actor: Actor,
  orderId: string,
  db: Database = getDb(),
): Promise<OrderDetailView> {
  const order = await loadCustomerOrder(db, orderId, actor.userId);
  if (!order) throw NOT_FOUND();
  return order;
}

/**
 * The courier projection, for the courier who holds the order now or whose delivery ended within the
 * last 24 hours. `null` for any other courier, including one who only saw it as an offer.
 */
export async function loadCourierOrder(
  db: DbExecutor,
  orderId: string,
  courierId: string,
  now: Date = new Date(),
): Promise<CourierOrderView | null> {
  const recent = new Date(now.getTime() - COURIER_ACCESS_AFTER_END_MS);
  const [row] = await db
    .select({
      order: orders,
      assignment: deliveryAssignments,
      pickupLocation: campusLocations.name,
      pickupNotes: restaurants.pickupNotes,
      customerFullName: users.name,
      customerDisplayName: userProfiles.displayName,
    })
    .from(deliveryAssignments)
    .innerJoin(orders, eq(orders.id, deliveryAssignments.orderId))
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .innerJoin(campusLocations, eq(campusLocations.id, restaurants.locationId))
    .innerJoin(users, eq(users.id, orders.customerId))
    .leftJoin(userProfiles, eq(userProfiles.userId, orders.customerId))
    .where(
      and(
        eq(deliveryAssignments.orderId, orderId),
        eq(deliveryAssignments.courierId, courierId),
        or(isNull(deliveryAssignments.endedAt), gte(deliveryAssignments.endedAt, recent)),
      ),
    )
    .orderBy(desc(deliveryAssignments.assignedAt))
    .limit(1);
  if (!row) return null;
  const { order: o, assignment: a } = row;

  const [items, events] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.id)),
    db
      .select({ status: orderStatusEvents.toStatus, at: orderStatusEvents.createdAt })
      .from(orderStatusEvents)
      .where(eq(orderStatusEvents.orderId, o.id))
      .orderBy(asc(orderStatusEvents.createdAt), asc(orderStatusEvents.id)),
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
    viewer: "COURIER",
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    version: o.version,
    restaurant: {
      name: o.restaurantNameSnapshot,
      pickupLocation: row.pickupLocation,
      pickupNotes: row.pickupNotes,
    },
    items: items.map((item) => ({
      name: item.nameSnapshot,
      quantity: item.quantity,
      options: options.filter((opt) => opt.orderItemId === item.id).map((opt) => opt.name),
      specialInstructions: item.specialInstructions,
    })),
    deliveryLocation: { name: o.deliveryLocationSnapshot },
    deliveryInstructions: courierCanSeeInstructions(a) ? o.deliveryInstructions : null,
    customerName: customerNameForCourier(row.customerDisplayName, row.customerFullName),
    timeline: events.map((e) => ({ status: e.status, at: e.at.toISOString() })),
    assignment: {
      assignedAt: a.assignedAt.toISOString(),
      pickedUpAt: a.pickedUpAt?.toISOString() ?? null,
      endedAt: a.endedAt?.toISOString() ?? null,
      endReason: a.endReason,
    },
    payoutCents: a.payoutCents ?? payoutFor(o),
    payoutIsSimulated: true,
    rating: (await loadReview(db, o.id))?.rating ?? null,
    allowedTransitions:
      a.endedAt === null
        ? allowedTransitions(o.status, "COURIER").map((toStatus) => ({
            toStatus,
            reasonRequired: checkTransition(o.status, toStatus, "COURIER").allowed === false,
          }))
        : [],
  };
}

/** GET /api/v1/orders/{orderId}: the projection for whoever is asking (API_SPEC §7.1), or 404. */
export async function getOrderForViewer(
  actor: Actor,
  orderId: string,
  db: Database = getDb(),
): Promise<OrderDetailView | CourierOrderView | AdminOrderView> {
  if (actor.role === "ADMIN") {
    const asAdmin = await loadAdminOrder(db, orderId);
    if (!asAdmin) throw NOT_FOUND();
    return asAdmin;
  }
  const asCustomer = await loadCustomerOrder(db, orderId, actor.userId);
  if (asCustomer) return asCustomer;
  if (actor.courier) {
    const asCourier = await loadCourierOrder(db, orderId, actor.courier.id);
    if (asCourier) return asCourier;
  }
  throw NOT_FOUND();
}

// ── History ──────────────────────────────────────────────────────────────────

/** GET /api/v1/orders: the caller's own orders, newest first, keyset-paginated (PRD ORD-8). */
export async function listOrders(
  actor: Actor,
  query: OrderListQuery,
  db: Database = getDb(),
): Promise<OrderListView> {
  const filters: SQL[] = [eq(orders.customerId, actor.userId)];
  const terminal = [...TERMINAL_STATUSES];
  if (query.scope === "active") filters.push(notInArray(orders.status, terminal));
  if (query.scope === "past") filters.push(inArray(orders.status, terminal));
  if (query.cursor) {
    const { timestamp, id } = decodeCursor(query.cursor);
    filters.push(sql`(${orders.createdAt}, ${orders.id}) < (${timestamp}::timestamptz, ${id}::uuid)`);
  }

  const cursorTs = microsecondTimestamp(orders.createdAt);
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      restaurantName: orders.restaurantNameSnapshot,
      status: orders.status,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      cursorTs,
    })
    .from(orders)
    .where(and(...filters))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  // Item counts in one grouped query. (A correlated subquery here would be easy to get subtly wrong:
  // an unqualified "id" inside it binds to order_items.id, not orders.id.)
  const counts = page.length
    ? await db
        .select({ orderId: orderItems.orderId, items: sql<number>`sum(${orderItems.quantity})::int` })
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            page.map((o) => o.id),
          ),
        )
        .groupBy(orderItems.orderId)
    : [];
  const itemCount = new Map(counts.map((c) => [c.orderId, c.items]));
  const last = page.at(-1);
  return {
    data: page.map(({ cursorTs: _cursor, createdAt, ...row }) => ({
      ...row,
      itemCount: itemCount.get(row.id) ?? 0,
      createdAt: createdAt.toISOString(),
    })),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.cursorTs, last.id) : null,
  };
}

// ── Status changes ───────────────────────────────────────────────────────────

/**
 * POST /api/v1/orders/{orderId}/transitions (API_SPEC §7). Works out who the caller is to this order and
 * hands the move to the referee (order-workflow.ts):
 *  - an admin sending `actingAs: "RESTAURANT_SIM"` is the simulated restaurant (Kitchen Console), audited;
 *  - the order's customer is CUSTOMER (can cancel while PLACED);
 *  - an admin is ADMIN (resolutions T2, T4, T6, T7, T9, T11, each needing a reason), audited;
 *  - a courier is COURIER, either accepting an offer or moving their own delivery along;
 *  - anyone else gets 404.
 */
export async function orderTransition(
  actor: Actor,
  orderId: string,
  input: TransitionInput,
  requestId?: string,
  db: Database = getDb(),
): Promise<OrderDetailView | CourierOrderView | KitchenOrderView | AdminOrderView> {
  if (input.actingAs === "RESTAURANT_SIM") {
    if (actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "Only admins can act for a restaurant.");
    await transitionOrder(db, {
      orderId,
      toStatus: input.toStatus,
      actorType: "RESTAURANT_SIM",
      actorUserId: actor.userId,
      reason: input.reason,
      expectedVersion: input.expectedVersion,
      audit: { actor, requestId },
    });
    const view = await loadKitchenOrder(db, orderId);
    if (!view) throw NOT_FOUND();
    return view;
  }

  const [order] = await db
    .select({ customerId: orders.customerId })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) throw NOT_FOUND();

  // A courier trying to accept their own order is told so (CANNOT_ACCEPT_OWN_ORDER), not treated as the customer.
  const acceptingOffer = input.toStatus === "ASSIGNED" && actor.courier !== null;
  if (order.customerId === actor.userId && !acceptingOffer) {
    await transitionOrder(db, {
      orderId,
      toStatus: input.toStatus,
      actorType: "CUSTOMER",
      actorUserId: actor.userId,
      reason: input.reason,
      expectedVersion: input.expectedVersion,
    });
    return getOrder(actor, orderId, db);
  }

  if (actor.role === "ADMIN" && !acceptingOffer) {
    await transitionOrder(db, {
      orderId,
      toStatus: input.toStatus,
      actorType: "ADMIN",
      actorUserId: actor.userId,
      reason: input.reason,
      expectedVersion: input.expectedVersion,
      audit: { actor, requestId },
    });
    const view = await loadAdminOrder(db, orderId);
    if (!view) throw NOT_FOUND();
    return view;
  }

  if (actor.courier) {
    if (actor.courier.status !== "APPROVED") {
      // Accepting gets a clear answer; anything else on someone else's order stays a 404 (T-01).
      if (!acceptingOffer) throw NOT_FOUND();
      throw new AppError("COURIER_NOT_APPROVED", "This needs an approved courier account.");
    }
    await transitionOrder(db, {
      orderId,
      toStatus: input.toStatus,
      actorType: "COURIER",
      actorUserId: actor.userId,
      courier: actor.courier,
      reason: input.reason,
      expectedVersion: input.expectedVersion,
    });
    const view = await loadCourierOrder(db, orderId, actor.courier.id);
    if (!view) throw NOT_FOUND();
    return view;
  }

  throw NOT_FOUND();
}
