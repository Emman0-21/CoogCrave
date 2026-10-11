import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { type Database, type DbExecutor, getDb } from "@/server/db/client";
import { orderItemOptions, orderItems, orders } from "@/server/db/schema";
import type { OrderStatus } from "@/shared/enums";
import type { KitchenOrderView } from "@/shared/schemas/delivery";

/**
 * Kitchen Console (PRD ADM-7): admins play the restaurant's part, confirming orders and marking them
 * ready. SIMULATION: no real restaurant is involved; every action is recorded with actor type
 * RESTAURANT_SIM and an audit event naming the admin. The view has what a kitchen needs (items, notes,
 * drop-off) and nothing about the customer.
 */

/** Orders the kitchen acts on: new, being prepared, and ready but waiting for a courier. */
export const KITCHEN_STATUSES: OrderStatus[] = ["PLACED", "CONFIRMED", "READY_FOR_PICKUP"];

async function withItems(db: DbExecutor, rows: (typeof orders.$inferSelect)[]): Promise<KitchenOrderView[]> {
  if (rows.length === 0) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(orderItems.id));
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
  return rows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    version: o.version,
    restaurantName: o.restaurantNameSnapshot,
    placedAt: o.createdAt.toISOString(),
    statusUpdatedAt: o.statusUpdatedAt.toISOString(),
    dropLocation: o.deliveryLocationSnapshot,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({
        name: i.nameSnapshot,
        quantity: i.quantity,
        options: options.filter((opt) => opt.orderItemId === i.id).map((opt) => opt.name),
        specialInstructions: i.specialInstructions,
      })),
  }));
}

/** GET /api/v1/admin/kitchen: oldest first, so the kitchen works through orders in the order they came in. */
export async function listKitchenOrders(db: Database = getDb()): Promise<KitchenOrderView[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(inArray(orders.status, KITCHEN_STATUSES))
    .orderBy(asc(orders.createdAt), asc(orders.id))
    .limit(100);
  return withItems(db, rows);
}

export async function loadKitchenOrder(db: DbExecutor, orderId: string): Promise<KitchenOrderView | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!row) return null;
  const [view] = await withItems(db, [row]);
  return view ?? null;
}
