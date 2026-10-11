import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as healthGet } from "@/app/api/health/route";
import { GET as auditGet } from "@/app/api/v1/admin/audit-events/route";
import { POST as courierDecisionPost } from "@/app/api/v1/admin/couriers/[courierId]/decision/route";
import { GET as adminCouriersGet } from "@/app/api/v1/admin/couriers/route";
import { POST as demoResetPost } from "@/app/api/v1/admin/demo/reset/route";
import { GET as kitchenGet } from "@/app/api/v1/admin/kitchen/route";
import { GET as metricsGet } from "@/app/api/v1/admin/metrics/route";
import { GET as adminOrdersGet } from "@/app/api/v1/admin/orders/route";
import { PATCH as adminUserPatch } from "@/app/api/v1/admin/users/[userId]/route";
import { GET as adminUsersGet } from "@/app/api/v1/admin/users/route";
import { GET as locationsGet } from "@/app/api/v1/locations/route";
import { DELETE as cartItemDelete, PATCH as cartItemPatch } from "@/app/api/v1/cart/items/[cartItemId]/route";
import { POST as cartItemsPost } from "@/app/api/v1/cart/items/route";
import { DELETE as cartDelete, GET as cartGet } from "@/app/api/v1/cart/route";
import { POST as quotePost } from "@/app/api/v1/checkout/quote/route";
import { POST as applyPost } from "@/app/api/v1/courier/application/route";
import { PUT as availabilityPut } from "@/app/api/v1/courier/availability/route";
import { GET as activeGet } from "@/app/api/v1/courier/deliveries/active/route";
import { GET as deliveriesGet } from "@/app/api/v1/courier/deliveries/route";
import { GET as earningsGet } from "@/app/api/v1/courier/earnings/route";
import { GET as courierMeGet } from "@/app/api/v1/courier/me/route";
import { POST as declinePost } from "@/app/api/v1/courier/offers/[orderId]/decline/route";
import { GET as offersGet } from "@/app/api/v1/courier/offers/route";
import { GET as cuisinesGet } from "@/app/api/v1/cuisines/route";
import { GET as meGet, PATCH as mePatch } from "@/app/api/v1/me/route";
import { GET as orderGet } from "@/app/api/v1/orders/[orderId]/route";
import { POST as transitionPost } from "@/app/api/v1/orders/[orderId]/transitions/route";
import { GET as ordersGet, POST as ordersPost } from "@/app/api/v1/orders/route";
import { GET as restaurantGet } from "@/app/api/v1/restaurants/[slug]/route";
import { GET as restaurantsGet } from "@/app/api/v1/restaurants/route";
import { POST as markReadPost } from "@/app/api/v1/notifications/mark-read/route";
import { GET as notificationsGet } from "@/app/api/v1/notifications/route";
import { POST as reviewPost } from "@/app/api/v1/orders/[orderId]/review/route";
import { PATCH as menuItemPatch } from "@/app/api/v1/admin/menu-items/[menuItemId]/route";
import { GET as adminRestaurantsGet } from "@/app/api/v1/admin/restaurants/route";
import { PATCH as restaurantPatch } from "@/app/api/v1/admin/restaurants/[restaurantId]/route";
import * as schema from "@/server/db/schema";

import { signedInUser } from "../support/auth";
import { openPool, resetDatabase } from "../support/db";
import {
  createCampus,
  createCourier,
  createLocation,
  createRestaurantWithItem,
  testDb,
  type TestDb,
} from "../support/fixtures";
import { appRequest, bodyOf, CookieJar, uniqueEmail } from "../support/http";

type Identity = "anonymous" | "student" | "courier" | "admin" | "suspended" | "unverified";

/**
 * Role-access matrix for every /api/v1 endpoint that exists (THREAT_MODEL T-03, PRD AUTH-6/7).
 * Each identity is a real account with a real session cookie; roles and states are applied in the
 * database the way the seed CLI and admin actions do, never through the API.
 */
describe("role-access matrix", () => {
  let pool: Pool;
  let db: TestDb;
  const jars = {} as Record<Identity, CookieJar>;
  let world: Awaited<ReturnType<typeof createRestaurantWithItem>>;
  // IDs that don't exist: signed-in users get 404 (nothing to see), others are stopped earlier.
  const missingId = crypto.randomUUID();
  const ctx = (value: Record<string, string>) => ({ params: Promise.resolve(value) });

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    const campus = await createCampus(db);
    const location = await createLocation(db, campus.id);
    world = await createRestaurantWithItem(db, campus.id, location.id);

    const make = async (label: string) => {
      const email = uniqueEmail(label);
      const jar = await signedInUser(email);
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      return { jar, user: user! };
    };
    const student = await make("student");
    const courier = await make("courier");
    await createCourier(db, courier.user.id, { status: "APPROVED" });
    const admin = await make("admin");
    await db.update(schema.users).set({ role: "ADMIN" }).where(eq(schema.users.id, admin.user.id));
    // Suspended / unverified after signing in: the session cookie is still valid, the account isn't.
    const suspended = await make("suspended");
    await db
      .update(schema.users)
      .set({ suspendedAt: new Date() })
      .where(eq(schema.users.id, suspended.user.id));
    const unverified = await make("unverified");
    await db
      .update(schema.users)
      .set({ emailVerified: false })
      .where(eq(schema.users.id, unverified.user.id));

    Object.assign(jars, {
      anonymous: new CookieJar(),
      student: student.jar,
      courier: courier.jar,
      admin: admin.jar,
      suspended: suspended.jar,
      unverified: unverified.jar,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  const endpoints = [
    { name: "GET /api/health", call: (jar: CookieJar) => healthGet(appRequest("/api/health", { jar })) },
    {
      name: "GET /api/v1/locations",
      call: (jar: CookieJar) => locationsGet(appRequest("/api/v1/locations", { jar })),
    },
    { name: "GET /api/v1/me", call: (jar: CookieJar) => meGet(appRequest("/api/v1/me", { jar })) },
    {
      name: "PATCH /api/v1/me",
      call: (jar: CookieJar) =>
        mePatch(appRequest("/api/v1/me", { method: "PATCH", body: { displayName: "Matrix" }, jar })),
    },
    {
      name: "GET /api/v1/admin/audit-events",
      call: (jar: CookieJar) => auditGet(appRequest("/api/v1/admin/audit-events", { jar })),
    },
    {
      name: "GET /api/v1/restaurants",
      call: (jar: CookieJar) => restaurantsGet(appRequest("/api/v1/restaurants", { jar })),
    },
    {
      name: "GET /api/v1/restaurants/{slug}",
      call: (jar: CookieJar) =>
        restaurantGet(
          appRequest(`/api/v1/restaurants/${world.restaurant.slug}`, { jar }),
          ctx({ slug: world.restaurant.slug }),
        ),
    },
    {
      name: "GET /api/v1/cuisines",
      call: (jar: CookieJar) => cuisinesGet(appRequest("/api/v1/cuisines", { jar })),
    },
    { name: "GET /api/v1/cart", call: (jar: CookieJar) => cartGet(appRequest("/api/v1/cart", { jar })) },
    {
      name: "POST /api/v1/cart/items",
      call: (jar: CookieJar) =>
        cartItemsPost(
          appRequest("/api/v1/cart/items", { body: { menuItemId: world.item.id, quantity: 1 }, jar }),
        ),
    },
    {
      name: "PATCH /api/v1/cart/items/{id}",
      call: (jar: CookieJar) =>
        cartItemPatch(
          appRequest(`/api/v1/cart/items/${missingId}`, { method: "PATCH", body: { quantity: 2 }, jar }),
          ctx({ cartItemId: missingId }),
        ),
    },
    {
      name: "DELETE /api/v1/cart/items/{id}",
      call: (jar: CookieJar) =>
        cartItemDelete(
          appRequest(`/api/v1/cart/items/${missingId}`, { method: "DELETE", jar }),
          ctx({ cartItemId: missingId }),
        ),
    },
    {
      name: "DELETE /api/v1/cart",
      call: (jar: CookieJar) => cartDelete(appRequest("/api/v1/cart", { method: "DELETE", jar })),
    },
    {
      name: "POST /api/v1/checkout/quote",
      call: (jar: CookieJar) =>
        quotePost(
          appRequest("/api/v1/checkout/quote", { body: { deliveryLocationId: missingId, tipCents: 0 }, jar }),
        ),
    },
    {
      name: "GET /api/v1/orders",
      call: (jar: CookieJar) => ordersGet(appRequest("/api/v1/orders", { jar })),
    },
    {
      name: "POST /api/v1/orders",
      call: (jar: CookieJar) =>
        ordersPost(
          appRequest("/api/v1/orders", {
            body: { deliveryLocationId: missingId, tipCents: 0, expectedTotalCents: 0 },
            headers: { "idempotency-key": crypto.randomUUID() },
            jar,
          }),
        ),
    },
    {
      name: "GET /api/v1/orders/{id}",
      call: (jar: CookieJar) =>
        orderGet(appRequest(`/api/v1/orders/${missingId}`, { jar }), ctx({ orderId: missingId })),
    },
    {
      name: "POST /api/v1/orders/{id}/transitions",
      call: (jar: CookieJar) =>
        transitionPost(
          appRequest(`/api/v1/orders/${missingId}/transitions`, { body: { toStatus: "CANCELLED" }, jar }),
          ctx({ orderId: missingId }),
        ),
    },
    {
      name: "GET /api/v1/courier/me",
      call: (jar: CookieJar) => courierMeGet(appRequest("/api/v1/courier/me", { jar })),
    },
    {
      name: "PUT /api/v1/courier/availability",
      call: (jar: CookieJar) =>
        availabilityPut(
          appRequest("/api/v1/courier/availability", { method: "PUT", body: { online: false }, jar }),
        ),
    },
    {
      name: "GET /api/v1/courier/offers",
      call: (jar: CookieJar) => offersGet(appRequest("/api/v1/courier/offers", { jar })),
    },
    {
      name: "POST /api/v1/courier/offers/{id}/decline",
      call: (jar: CookieJar) =>
        declinePost(
          appRequest(`/api/v1/courier/offers/${missingId}/decline`, { body: {}, jar }),
          ctx({ orderId: missingId }),
        ),
    },
    {
      name: "GET /api/v1/courier/deliveries",
      call: (jar: CookieJar) => deliveriesGet(appRequest("/api/v1/courier/deliveries", { jar })),
    },
    {
      name: "GET /api/v1/courier/deliveries/active",
      call: (jar: CookieJar) => activeGet(appRequest("/api/v1/courier/deliveries/active", { jar })),
    },
    {
      name: "GET /api/v1/courier/earnings",
      call: (jar: CookieJar) => earningsGet(appRequest("/api/v1/courier/earnings", { jar })),
    },
    {
      name: "GET /api/v1/admin/kitchen",
      call: (jar: CookieJar) => kitchenGet(appRequest("/api/v1/admin/kitchen", { jar })),
    },
    {
      name: "GET /api/v1/admin/metrics",
      call: (jar: CookieJar) => metricsGet(appRequest("/api/v1/admin/metrics", { jar })),
    },
    {
      name: "GET /api/v1/admin/users",
      call: (jar: CookieJar) => adminUsersGet(appRequest("/api/v1/admin/users", { jar })),
    },
    {
      name: "PATCH /api/v1/admin/users/{id}",
      call: (jar: CookieJar) =>
        adminUserPatch(
          appRequest(`/api/v1/admin/users/${missingId}`, {
            method: "PATCH",
            body: { suspended: true, reason: "Matrix" },
            jar,
          }),
          ctx({ userId: missingId }),
        ),
    },
    {
      name: "GET /api/v1/admin/couriers",
      call: (jar: CookieJar) => adminCouriersGet(appRequest("/api/v1/admin/couriers", { jar })),
    },
    {
      name: "POST /api/v1/admin/couriers/{id}/decision",
      call: (jar: CookieJar) =>
        courierDecisionPost(
          appRequest(`/api/v1/admin/couriers/${missingId}/decision`, { body: { decision: "APPROVE" }, jar }),
          ctx({ courierId: missingId }),
        ),
    },
    {
      name: "GET /api/v1/admin/orders",
      call: (jar: CookieJar) => adminOrdersGet(appRequest("/api/v1/admin/orders", { jar })),
    },
    {
      // Switched off in tests (DEMO_RESET_ENABLED=false): even admins get 404.
      name: "POST /api/v1/admin/demo/reset",
      call: (jar: CookieJar) =>
        demoResetPost(appRequest("/api/v1/admin/demo/reset", { body: { confirm: "RESET DEMO DATA" }, jar })),
    },
    {
      name: "POST /api/v1/orders/{id}/review",
      call: (jar: CookieJar) =>
        reviewPost(
          appRequest(`/api/v1/orders/${missingId}/review`, { body: { rating: 5 }, jar }),
          ctx({ orderId: missingId }),
        ),
    },
    {
      name: "GET /api/v1/notifications",
      call: (jar: CookieJar) => notificationsGet(appRequest("/api/v1/notifications", { jar })),
    },
    {
      name: "POST /api/v1/notifications/mark-read",
      call: (jar: CookieJar) =>
        markReadPost(appRequest("/api/v1/notifications/mark-read", { body: { all: true }, jar })),
    },
    {
      name: "GET /api/v1/admin/restaurants",
      call: (jar: CookieJar) => adminRestaurantsGet(appRequest("/api/v1/admin/restaurants", { jar })),
    },
    {
      name: "PATCH /api/v1/admin/restaurants/{id}",
      call: (jar: CookieJar) =>
        restaurantPatch(
          appRequest(`/api/v1/admin/restaurants/${missingId}`, {
            method: "PATCH",
            body: { isAcceptingOrders: true },
            jar,
          }),
          ctx({ restaurantId: missingId }),
        ),
    },
    {
      name: "PATCH /api/v1/admin/menu-items/{id}",
      call: (jar: CookieJar) =>
        menuItemPatch(
          appRequest(`/api/v1/admin/menu-items/${missingId}`, {
            method: "PATCH",
            body: { isAvailable: true },
            jar,
          }),
          ctx({ menuItemId: missingId }),
        ),
    },
    // Last: it gives the student and admin a (pending) courier profile.
    {
      name: "POST /api/v1/courier/application",
      call: (jar: CookieJar) =>
        applyPost(
          appRequest("/api/v1/courier/application", {
            body: { transportMode: "WALK", acceptGuidelines: true },
            jar,
          }),
        ),
    },
  ] as const;

  const U = 401;
  const F = 403;
  /** Public: same answer for everyone. */
  const everyone = (status: number) => ({
    anonymous: status,
    student: status,
    courier: status,
    admin: status,
    suspended: status,
    unverified: status,
  });
  /** Any active, verified account (role doesn't matter); denied otherwise. */
  const anyUser = (status: number) => ({
    anonymous: U,
    student: status,
    courier: status,
    admin: status,
    suspended: F,
    unverified: F,
  });
  /** Approved couriers only: everyone else is stopped at the access level (403 COURIER_NOT_APPROVED). */
  const courierOnly = (status: number) => ({
    anonymous: U,
    student: F,
    courier: status,
    admin: F,
    suspended: F,
    unverified: F,
  });
  /** Admins only. */
  const adminOnly = (status: number) => ({
    anonymous: U,
    student: F,
    courier: F,
    admin: status,
    suspended: F,
    unverified: F,
  });
  // Expected status for each endpoint × identity. Endpoints run in this order, so the cart is empty
  // again (DELETE /cart) before quote and order placement, which then fail on business rules (422).
  const expected: Record<(typeof endpoints)[number]["name"], Record<Identity, number>> = {
    "GET /api/v1/restaurants": everyone(200),
    "GET /api/v1/restaurants/{slug}": everyone(200),
    "GET /api/v1/cuisines": everyone(200),
    "GET /api/v1/cart": anyUser(200),
    "POST /api/v1/cart/items": anyUser(201),
    "PATCH /api/v1/cart/items/{id}": anyUser(404),
    "DELETE /api/v1/cart/items/{id}": anyUser(404),
    "DELETE /api/v1/cart": anyUser(200),
    "POST /api/v1/checkout/quote": anyUser(422),
    "GET /api/v1/orders": anyUser(200),
    "POST /api/v1/orders": anyUser(422),
    "GET /api/v1/orders/{id}": anyUser(404),
    "POST /api/v1/orders/{id}/transitions": anyUser(404),
    "POST /api/v1/orders/{id}/review": anyUser(404),
    "GET /api/v1/notifications": anyUser(200),
    "POST /api/v1/notifications/mark-read": anyUser(204),
    // Students and admins without a courier profile: 404 (nothing to show); the approved courier: 200.
    "GET /api/v1/courier/me": {
      anonymous: U,
      student: 404,
      courier: 200,
      admin: 404,
      suspended: F,
      unverified: F,
    },
    // Courier-only: needs an approved courier profile, whatever the role (admins aren't couriers).
    "PUT /api/v1/courier/availability": courierOnly(200),
    "GET /api/v1/courier/offers": courierOnly(403), // approved but offline: COURIER_OFFLINE
    "POST /api/v1/courier/offers/{id}/decline": courierOnly(404),
    "GET /api/v1/courier/deliveries": courierOnly(200),
    "GET /api/v1/courier/deliveries/active": courierOnly(204),
    "GET /api/v1/courier/earnings": courierOnly(200),
    "GET /api/v1/admin/kitchen": {
      anonymous: U,
      student: F,
      courier: F,
      admin: 200,
      suspended: F,
      unverified: F,
    },
    "GET /api/v1/admin/metrics": adminOnly(200),
    "GET /api/v1/admin/users": adminOnly(200),
    "PATCH /api/v1/admin/users/{id}": adminOnly(404),
    "GET /api/v1/admin/couriers": adminOnly(200),
    "POST /api/v1/admin/couriers/{id}/decision": adminOnly(404),
    "GET /api/v1/admin/orders": adminOnly(200),
    "POST /api/v1/admin/demo/reset": adminOnly(404),
    "GET /api/v1/admin/restaurants": adminOnly(200),
    "PATCH /api/v1/admin/restaurants/{id}": adminOnly(404),
    "PATCH /api/v1/admin/menu-items/{id}": adminOnly(404),
    // The approved courier already has a profile: 409.
    "POST /api/v1/courier/application": {
      anonymous: U,
      student: 201,
      courier: 409,
      admin: 201,
      suspended: F,
      unverified: F,
    },
    "GET /api/health": {
      anonymous: 200,
      student: 200,
      courier: 200,
      admin: 200,
      suspended: 200,
      unverified: 200,
    },
    "GET /api/v1/locations": {
      anonymous: 200,
      student: 200,
      courier: 200,
      admin: 200,
      suspended: 200,
      unverified: 200,
    },
    "GET /api/v1/me": { anonymous: U, student: 200, courier: 200, admin: 200, suspended: F, unverified: F },
    "PATCH /api/v1/me": { anonymous: U, student: 200, courier: 200, admin: 200, suspended: F, unverified: F },
    "GET /api/v1/admin/audit-events": {
      anonymous: U,
      student: F,
      courier: F,
      admin: 200,
      suspended: F,
      unverified: F,
    },
  };

  for (const endpoint of endpoints) {
    it(endpoint.name, async () => {
      const actual: Record<string, number> = {};
      for (const identity of Object.keys(expected[endpoint.name]) as Identity[]) {
        actual[identity] = (await endpoint.call(jars[identity])).status;
      }
      expect(actual).toEqual(expected[endpoint.name]);
    });
  }

  it("explains each denial with the documented error code", async () => {
    const codeOf = async (response: Response) =>
      (await bodyOf<{ error: { code: string } }>(response)).error.code;
    expect(await codeOf(await meGet(appRequest("/api/v1/me")))).toBe("UNAUTHENTICATED");
    expect(await codeOf(await meGet(appRequest("/api/v1/me", { jar: jars.suspended })))).toBe(
      "ACCOUNT_SUSPENDED",
    );
    expect(await codeOf(await meGet(appRequest("/api/v1/me", { jar: jars.unverified })))).toBe(
      "EMAIL_NOT_VERIFIED",
    );
    expect(
      await codeOf(await auditGet(appRequest("/api/v1/admin/audit-events", { jar: jars.courier }))),
    ).toBe("FORBIDDEN");
  });

  it("can't be escalated by sending a role, even to an endpoint the user may call", async () => {
    const response = await mePatch(
      appRequest("/api/v1/me", {
        method: "PATCH",
        body: { displayName: "Sneaky", role: "ADMIN" },
        jar: jars.student,
      }),
    );
    expect(response.status).toBe(400);
    const me = await bodyOf<{ role: string }>(await meGet(appRequest("/api/v1/me", { jar: jars.student })));
    expect(me.role).toBe("STUDENT");
    expect((await auditGet(appRequest("/api/v1/admin/audit-events", { jar: jars.student }))).status).toBe(
      403,
    );
  });

  it("rejects a forged session cookie", async () => {
    const forged = new CookieJar();
    forged.absorb(
      new Response(null, { headers: { "set-cookie": "coogcrave.session_token=forged.signature; Path=/" } }),
    );
    expect((await meGet(appRequest("/api/v1/me", { jar: forged }))).status).toBe(401);
  });
});
