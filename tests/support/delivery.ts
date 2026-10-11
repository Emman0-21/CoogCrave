import { eq } from "drizzle-orm";

import { GET as orderGet } from "@/app/api/v1/orders/[orderId]/route";
import { POST as transitionPost } from "@/app/api/v1/orders/[orderId]/transitions/route";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { transitionOrder } from "@/server/services/order-workflow";

import { signedInUser } from "./auth";
import { createCourier, type TestDb } from "./fixtures";
import { appRequest, type CookieJar, uniqueEmail } from "./http";
import { addToCart, checkout, seeded } from "./ordering";

export const BURGER = "the-burger-joint";
export const LIBRARY = () => seeded.location("library");

/** A signed-in student with a courier profile in the given state (set directly, as an admin decision would). */
export async function courierAccount(
  db: TestDb,
  label: string,
  profile: Partial<typeof schema.courierProfiles.$inferInsert> = { status: "APPROVED", isOnline: true },
): Promise<{ jar: CookieJar; userId: string; courierId: string; email: string }> {
  const email = uniqueEmail(label);
  const jar = await signedInUser(email);
  // A distinct name per courier, so tests can tell who the customer sees ("Sam", not the default "Alex").
  const name = `${label[0]!.toUpperCase()}${label.slice(1)} Courier`;
  const [user] = await db.update(schema.users).set({ name }).where(eq(schema.users.email, email)).returning();
  const courier = await createCourier(db, user!.id, {
    onlineSince: profile.isOnline ? new Date() : null,
    ...profile,
  });
  return { jar, userId: user!.id, courierId: courier.id, email };
}

/**
 * A placed order (two bacon double cheeseburgers, $3 tip, to the library), moved to READY_FOR_PICKUP by
 * the simulated restaurant, the way the Kitchen Console does it.
 */
export async function readyOrder(
  customer: CookieJar,
  extra: { tipCents?: number; deliveryInstructions?: string } = { tipCents: 300 },
): Promise<string> {
  await addToCart(customer, {
    menuItemId: seeded.item(BURGER, "double-cheeseburger"),
    quantity: 2,
    optionIds: [seeded.option(BURGER, "double-cheeseburger", "double-cheeseburger-addons", "bacon")],
  });
  const order = await checkout(customer, LIBRARY(), extra);
  for (const toStatus of ["CONFIRMED", "READY_FOR_PICKUP"] as const) {
    await transitionOrder(getDb(), {
      orderId: order.id,
      toStatus,
      actorType: "RESTAURANT_SIM",
      actorUserId: null,
    });
  }
  return order.id;
}

export function transition(
  jar: CookieJar,
  orderId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return transitionPost(appRequest(`/api/v1/orders/${orderId}/transitions`, { body, jar }), {
    params: Promise.resolve({ orderId }),
  });
}

export function viewOrder(jar: CookieJar, orderId: string): Promise<Response> {
  return orderGet(appRequest(`/api/v1/orders/${orderId}`, { jar }), { params: Promise.resolve({ orderId }) });
}
