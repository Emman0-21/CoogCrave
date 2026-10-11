import "server-only";

import { and, asc, desc, eq, inArray, notInArray, type SQL, sql } from "drizzle-orm";

import { type Database, type DbExecutor, getDb } from "@/server/db/client";
import {
  campusLocations,
  orderItemOptions,
  orderItems,
  orders,
  orderStatusEvents,
  payments,
  restaurants,
} from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import {
  allowedTransitions,
  checkTransition,
  TERMINAL_STATUSES,
  TRANSITIONS,
} from "@/server/domain/order-state-machine";
import { AppError } from "@/server/http/errors";
import { getPaymentGateway, type PaymentGateway } from "@/server/payments/gateway";
import type { ActorType, NotificationType, OrderStatus } from "@/shared/enums";
import type {
  OrderDetailView,
  OrderListQuery,
  OrderListView,
  TransitionInput,
} from "@/shared/schemas/ordering";

import { notifyOrder } from "./notifications";
import { decodeCursor, encodeCursor, microsecondTimestamp } from "./pagination";

/**
 * Orders after placement: history, detail, and status changes (PRD ORD-7…9, TRK-1).
 *
 * Visibility (THREAT_MODEL T-01): in Phase 4 only the customer who placed an order can see it. Every
 * query filters by customer ID, and anyone else gets the same 404 as for an order that doesn't exist,
 * so order IDs can't be probed. Courier and admin projections arrive with those features (Phases 5–6).
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

  const [items, events, [payment]] = await Promise.all([
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
    allowedTransitions: allowedTransitions(o.status, "CUSTOMER").map((toStatus) => ({
      toStatus,
      actingAs: null,
      reasonRequired: checkTransition(o.status, toStatus, "CUSTOMER").allowed === false,
    })),
  };
}

/** GET /api/v1/orders/{orderId} */
export async function getOrder(
  actor: Actor,
  orderId: string,
  db: Database = getDb(),
): Promise<OrderDetailView> {
  const order = await loadCustomerOrder(db, orderId, actor.userId);
  if (!order) throw NOT_FOUND();
  return order;
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

const NOTIFY_CUSTOMER: Partial<Record<OrderStatus, NotificationType>> = {
  CONFIRMED: "ORDER_CONFIRMED",
  READY_FOR_PICKUP: "ORDER_READY",
  CANCELLED: "ORDER_CANCELLED",
};

/**
 * Transitions whose side effects exist so far. Courier assignment moves (T5, T7–T11) create, release, or
 * complete delivery assignments and payouts, which are built with the courier features in Phase 5; until
 * then they are refused here rather than half-applied.
 */
const SUPPORTED_RULES = new Set(["T1", "T2", "T3", "T4", "T6"]);

export interface TransitionRequest {
  orderId: string;
  toStatus: OrderStatus;
  actorType: ActorType;
  /** Null only for RESTAURANT_SIM / SYSTEM actions (the database enforces this too). */
  actorUserId: string | null;
  reason?: string | null;
  expectedVersion?: number;
}

/**
 * The single referee for every status change (docs/ARCHITECTURE.md §6–7). Checks the move against the
 * state machine, then applies it with compare-and-set on the current status (and version, if the caller
 * sent one), so two conflicting changes can never both succeed. History, payment, and notification rows
 * are written in the same transaction.
 *
 * Callers decide the actor type from the caller's relationship to the order; this function trusts it.
 */
export async function transitionOrder(
  db: Database,
  request: TransitionRequest,
  gateway: PaymentGateway = getPaymentGateway(),
): Promise<void> {
  const voidedReferences = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: orders.id,
        status: orders.status,
        version: orders.version,
        customerId: orders.customerId,
        orderNumber: orders.orderNumber,
        restaurantName: orders.restaurantNameSnapshot,
      })
      .from(orders)
      .where(eq(orders.id, request.orderId));
    if (!current) throw NOT_FOUND();

    const decision = checkTransition(current.status, request.toStatus, request.actorType, request.reason);
    if (!decision.allowed) {
      throw decision.code === "REASON_REQUIRED"
        ? new AppError("REASON_REQUIRED", "Give a reason for this change.")
        : new AppError("INVALID_TRANSITION", transitionRefusal(current.status, request.toStatus), {
            currentStatus: current.status,
          });
    }
    if (!SUPPORTED_RULES.has(decision.rule.id)) {
      throw new Error(`Transition ${decision.rule.id} needs courier assignment support (Phase 5).`);
    }
    if (request.expectedVersion !== undefined && request.expectedVersion !== current.version) {
      throw staleState(current.status);
    }

    // Compare-and-set: succeeds only if nobody changed the order since it was read above.
    const updated = await tx
      .update(orders)
      .set({
        status: request.toStatus,
        statusUpdatedAt: sql`now()`,
        version: sql`${orders.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, current.id),
          eq(orders.status, current.status),
          eq(orders.version, current.version),
        ),
      )
      .returning({ id: orders.id });
    if (updated.length === 0) throw staleState(current.status);

    await tx.insert(orderStatusEvents).values({
      orderId: current.id,
      fromStatus: current.status,
      toStatus: request.toStatus,
      actorType: request.actorType,
      actorUserId: request.actorUserId,
      reason: request.reason?.trim() || null,
    });

    const voided =
      request.toStatus === "CANCELLED"
        ? await tx
            .update(payments)
            .set({ status: "VOIDED", updatedAt: new Date() })
            .where(and(eq(payments.orderId, current.id), eq(payments.status, "AUTHORIZED")))
            .returning({ reference: payments.providerReference })
        : [];

    const notice = NOTIFY_CUSTOMER[request.toStatus];
    if (notice) {
      await notifyOrder(tx, notice, {
        userId: current.customerId,
        orderId: current.id,
        orderNumber: current.orderNumber,
        restaurantName: current.restaurantName,
      });
    }
    return voided.map((v) => v.reference);
  });

  // Tell the processor only after the change has committed, so a rolled-back cancel never voids a payment.
  // (The demo gateway can't fail; a real one would need a retry queue here.)
  for (const reference of voidedReferences) await gateway.void(reference);
}

function staleState(status: OrderStatus): AppError {
  return new AppError("STALE_STATE", "This order just changed. Refresh to see its latest status.", {
    currentStatus: status,
  });
}

function transitionRefusal(from: OrderStatus, to: OrderStatus): string {
  if (to === "CANCELLED" && from !== "PLACED") {
    return "The restaurant has already started on this order, so it can't be cancelled here.";
  }
  if (TERMINAL_STATUSES.includes(from)) return "This order is already finished.";
  return "That change isn't possible for this order right now.";
}

/**
 * POST /api/v1/orders/{orderId}/transitions. In Phase 4 the only caller relationship is the order's
 * customer, so the only possible move is cancelling a PLACED order (T2). Anyone else gets 404.
 */
export async function customerTransition(
  actor: Actor,
  orderId: string,
  input: TransitionInput,
  db: Database = getDb(),
): Promise<OrderDetailView> {
  const [owned] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, actor.userId)));
  if (!owned) throw NOT_FOUND();

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

/** Exposed for tests and docs: the rule IDs this phase can apply. */
export const SUPPORTED_TRANSITIONS = TRANSITIONS.filter((t) => SUPPORTED_RULES.has(t.id));
