import { and, eq } from "drizzle-orm";

import { GET as cartGet } from "@/app/api/v1/cart/route";
import { POST as cartItemsPost } from "@/app/api/v1/cart/items/route";
import { POST as quotePost } from "@/app/api/v1/checkout/quote/route";
import { POST as ordersPost } from "@/app/api/v1/orders/route";
import * as schema from "@/server/db/schema";
import { seedId } from "@/server/seed/ids";
import type { CartView, OrderDetailView, QuoteView } from "@/shared/schemas/ordering";

import type { TestDb } from "./fixtures";
import { appRequest, bodyOf, type CookieJar } from "./http";

/** IDs of seeded catalog rows (src/server/seed/catalog-data.ts), derived the same way the seed does. */
export const seeded = {
  restaurant: (key: string) => seedId(`restaurant:${key}`),
  item: (restaurant: string, item: string) => seedId(`item:${restaurant}:${item}`),
  option: (restaurant: string, item: string, group: string, option: string) =>
    seedId(`option:${restaurant}:${item}:${group}:${option}`),
  location: (key: string) => seedId(`location:${key}`),
};

/** Replaces a restaurant's hours with "open all day, every day", so tests don't depend on the clock. */
export async function openAllWeek(db: TestDb, restaurantId: string): Promise<void> {
  await db.delete(schema.restaurantHours).where(eq(schema.restaurantHours.restaurantId, restaurantId));
  await db.insert(schema.restaurantHours).values(
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      restaurantId,
      dayOfWeek,
      opensAtMinute: 0,
      closesAtMinute: 1440,
    })),
  );
}

/** Removes every opening, so the restaurant is closed whatever the time. */
export async function closeAllWeek(db: TestDb, restaurantId: string): Promise<void> {
  await db.delete(schema.restaurantHours).where(eq(schema.restaurantHours.restaurantId, restaurantId));
}

/** Empties carts and orders between tests without re-creating accounts (hashing passwords is slow). */
export async function clearOrdering(db: TestDb): Promise<void> {
  await db.delete(schema.orders);
  await db.delete(schema.carts);
  await db.delete(schema.notifications);
}

export async function setItem(
  db: TestDb,
  restaurant: string,
  item: string,
  changes: Partial<typeof schema.menuItems.$inferInsert>,
): Promise<void> {
  await db
    .update(schema.menuItems)
    .set(changes)
    .where(
      and(
        eq(schema.menuItems.id, seeded.item(restaurant, item)),
        eq(schema.menuItems.restaurantId, seeded.restaurant(restaurant)),
      ),
    );
}

export async function addToCart(jar: CookieJar, body: Record<string, unknown>): Promise<Response> {
  return cartItemsPost(appRequest("/api/v1/cart/items", { body, jar }));
}

export async function cartOf(jar: CookieJar): Promise<CartView> {
  return bodyOf<CartView>(await cartGet(appRequest("/api/v1/cart", { jar })));
}

export async function quoteFor(jar: CookieJar, deliveryLocationId: string, tipCents = 0): Promise<QuoteView> {
  const response = await quotePost(
    appRequest("/api/v1/checkout/quote", { body: { deliveryLocationId, tipCents }, jar }),
  );
  if (response.status !== 200) throw new Error(`quote failed: ${response.status} ${await response.text()}`);
  return bodyOf<QuoteView>(response);
}

export function placeOrderRequest(
  jar: CookieJar,
  body: Record<string, unknown>,
  key: string | null = crypto.randomUUID(),
): Promise<Response> {
  return ordersPost(
    appRequest("/api/v1/orders", { body, jar, headers: key ? { "idempotency-key": key } : {} }),
  );
}

/** Quote, then place with the quoted total: the happy path the checkout page follows. */
export async function checkout(
  jar: CookieJar,
  deliveryLocationId: string,
  extra: { tipCents?: number; deliveryInstructions?: string } = {},
): Promise<OrderDetailView> {
  const quote = await quoteFor(jar, deliveryLocationId, extra.tipCents ?? 0);
  const response = await placeOrderRequest(jar, {
    deliveryLocationId,
    tipCents: extra.tipCents ?? 0,
    deliveryInstructions: extra.deliveryInstructions,
    expectedTotalCents: quote.totalCents,
  });
  if (response.status !== 201) throw new Error(`order failed: ${response.status} ${await response.text()}`);
  return bodyOf<OrderDetailView>(response);
}
