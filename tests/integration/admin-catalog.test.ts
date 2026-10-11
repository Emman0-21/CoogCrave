import { and, asc, eq, gte } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PATCH as menuItemPatch } from "@/app/api/v1/admin/menu-items/[menuItemId]/route";
import { GET as adminRestaurantsGet } from "@/app/api/v1/admin/restaurants/route";
import { PATCH as restaurantPatch } from "@/app/api/v1/admin/restaurants/[restaurantId]/route";
import { GET as restaurantGet } from "@/app/api/v1/restaurants/[slug]/route";
import * as schema from "@/server/db/schema";
import { seedCatalog } from "@/server/seed/catalog";
import type { RestaurantDetail, RestaurantSummary } from "@/shared/schemas/ordering";

import { signedInUser } from "../support/auth";
import { BURGER, LIBRARY, viewOrder } from "../support/delivery";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { appRequest, bodyOf, type CookieJar, uniqueEmail } from "../support/http";
import {
  addToCart,
  cartOf,
  checkout,
  clearOrdering,
  openAllWeek,
  placeOrderRequest,
  quoteFor,
  seeded,
} from "../support/ordering";

type ErrorBody = { error: { code: string } };
const codeOf = async (response: Response) => (await bodyOf<ErrorBody>(response)).error?.code;

const patchRestaurant = (jar: CookieJar, restaurantId: string, body: unknown) =>
  restaurantPatch(appRequest(`/api/v1/admin/restaurants/${restaurantId}`, { method: "PATCH", body, jar }), {
    params: Promise.resolve({ restaurantId }),
  });
const patchItem = (jar: CookieJar, menuItemId: string, body: unknown) =>
  menuItemPatch(appRequest(`/api/v1/admin/menu-items/${menuItemId}`, { method: "PATCH", body, jar }), {
    params: Promise.resolve({ menuItemId }),
  });
const menuOf = async (slug: string) =>
  bodyOf<RestaurantDetail>(
    await restaurantGet(appRequest(`/api/v1/restaurants/${slug}`), { params: Promise.resolve({ slug }) }),
  );

/** Restaurant and menu editing, essentials (PRD ADM-4, ADM-5, ADM-9). */
describe("admin restaurant and menu editing", () => {
  let pool: Pool;
  let db: TestDb;
  let admin: CookieJar;
  let adminId: string;
  let alex: CookieJar;
  const burger = () => seeded.restaurant(BURGER);
  const fries = () => seeded.item(BURGER, "fries");

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    const adminEmail = uniqueEmail("admin");
    admin = await signedInUser(adminEmail);
    const [row] = await db
      .update(schema.users)
      .set({ role: "ADMIN" })
      .where(eq(schema.users.email, adminEmail))
      .returning({ id: schema.users.id });
    adminId = row!.id;
    alex = await signedInUser(uniqueEmail("alex"));
  });
  let testStart: Date;
  beforeEach(async () => {
    testStart = new Date();
    await clearOrdering(db);
    await seedCatalog(db); // sample values back before each test
    await openAllWeek(db, burger());
  });
  afterAll(async () => {
    await pool.end();
  });

  const auditFor = (targetId: string) =>
    db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.targetId, targetId),
          eq(schema.auditEvents.actorUserId, adminId),
          // The audit log is append-only, so each test looks at its own rows.
          gte(schema.auditEvents.createdAt, testStart),
        ),
      )
      .orderBy(asc(schema.auditEvents.createdAt));

  it("closes a restaurant for orders and opens it again, audited once per real change", async () => {
    await addToCart(alex, { menuItemId: fries(), quantity: 2 });

    const closed = await patchRestaurant(admin, burger(), { isAcceptingOrders: false });
    expect(closed.status).toBe(200);
    expect(await bodyOf(closed)).toEqual({ id: burger(), isAcceptingOrders: false });
    expect((await menuOf(BURGER)).canOrder).toBe(false);
    const list = await bodyOf<{ data: RestaurantSummary[] }>(
      await adminRestaurantsGet(appRequest("/api/v1/admin/restaurants", { jar: admin })),
    );
    expect(list.data.find((r) => r.id === burger())).toMatchObject({ isAcceptingOrders: false });

    // The customer's cart now says so, and the order can't go through.
    expect((await cartOf(alex)).problems).toContain("RESTAURANT_CLOSED");
    const blocked = await placeOrderRequest(alex, {
      deliveryLocationId: LIBRARY(),
      tipCents: 0,
      expectedTotalCents: 1,
    });
    expect(await codeOf(blocked)).toBe("RESTAURANT_CLOSED");

    // Repeating the same change is accepted but changes and records nothing.
    expect((await patchRestaurant(admin, burger(), { isAcceptingOrders: false })).status).toBe(200);
    await patchRestaurant(admin, burger(), { isAcceptingOrders: true });
    expect((await menuOf(BURGER)).canOrder).toBe(true);

    const audit = await auditFor(burger());
    expect(audit.map((a) => [a.action, a.metadata])).toEqual([
      [
        "restaurant.update",
        expect.objectContaining({ before: { isAcceptingOrders: true }, after: { isAcceptingOrders: false } }),
      ],
      [
        "restaurant.update",
        expect.objectContaining({ before: { isAcceptingOrders: false }, after: { isAcceptingOrders: true } }),
      ],
    ]);
  });

  it("marks an item sold out: it can't be added, and carts holding it are flagged", async () => {
    await addToCart(alex, { menuItemId: fries(), quantity: 1 });
    const response = await patchItem(admin, fries(), { isAvailable: false });
    expect(await bodyOf(response)).toMatchObject({ id: fries(), name: "Fries", isAvailable: false });

    const item = (await menuOf(BURGER)).menu.flatMap((c) => c.items).find((i) => i.id === fries());
    expect(item?.isAvailable).toBe(false);
    expect((await cartOf(alex)).problems.length).toBeGreaterThan(0);
    const jordan = await signedInUser(uniqueEmail("jordan"));
    const add = await addToCart(jordan, { menuItemId: fries(), quantity: 1 });
    expect(await codeOf(add)).toBe("ITEM_UNAVAILABLE");

    await patchItem(admin, fries(), { isAvailable: true });
    expect((await addToCart(jordan, { menuItemId: fries(), quantity: 1 })).status).toBe(201);
  });

  it("changes a price: carts re-price, a stale total is refused, and placed orders keep their price", async () => {
    await addToCart(alex, { menuItemId: fries(), quantity: 2 });
    const placed = await checkout(alex, LIBRARY()); // at the sample price
    const placedPrice = placed.items[0]!.unitPriceCents;

    await addToCart(alex, { menuItemId: fries(), quantity: 3 }); // above the minimum subtotal
    const before = await quoteFor(alex, LIBRARY());
    const changed = await patchItem(admin, fries(), { priceCents: placedPrice + 100 });
    expect(await bodyOf(changed)).toMatchObject({ priceCents: placedPrice + 100, isAvailable: true });

    expect((await cartOf(alex)).items[0]!.unitPriceCents).toBe(placedPrice + 100);
    const stale = await placeOrderRequest(alex, {
      deliveryLocationId: LIBRARY(),
      tipCents: 0,
      expectedTotalCents: before.totalCents,
    });
    expect([stale.status, await codeOf(stale)]).toEqual([409, "PRICE_CHANGED"]);

    // The earlier order is a snapshot: unchanged.
    const earlier = await bodyOf<{ items: { unitPriceCents: number }[] }>(await viewOrder(alex, placed.id));
    expect(earlier.items[0]!.unitPriceCents).toBe(placedPrice);

    const [audit] = await auditFor(fries());
    expect(audit).toMatchObject({
      action: "menu_item.update",
      metadata: expect.objectContaining({
        before: { priceCents: placedPrice },
        after: { priceCents: placedPrice + 100 },
      }),
    });
  });

  it("refuses bad input (400) and unknown or deleted targets (404), and records no-op changes nowhere", async () => {
    for (const bad of [
      {},
      { priceCents: -1 },
      { priceCents: 10_001 },
      { priceCents: 3.5 },
      { priceCents: "399" },
      { isAvailable: "no" },
      { name: "Free fries" },
    ]) {
      expect((await patchItem(admin, fries(), bad)).status).toBe(400);
    }
    for (const bad of [{}, { isAcceptingOrders: "yes" }, { isAcceptingOrders: true, name: "x" }]) {
      expect((await patchRestaurant(admin, burger(), bad)).status).toBe(400);
    }
    // Setting what's already there is accepted and records nothing.
    expect((await patchItem(admin, fries(), { isAvailable: true })).status).toBe(200);
    const missing = crypto.randomUUID();
    expect((await patchItem(admin, missing, { isAvailable: false })).status).toBe(404);
    expect((await patchRestaurant(admin, missing, { isAcceptingOrders: false })).status).toBe(404);

    await db.update(schema.menuItems).set({ deletedAt: new Date() }).where(eq(schema.menuItems.id, fries()));
    expect((await patchItem(admin, fries(), { isAvailable: false })).status).toBe(404);

    expect(await auditFor(fries())).toEqual([]);
    expect(await auditFor(burger())).toEqual([]);
  });

  it("is restored by the seed (the sample menu is the source of truth)", async () => {
    await patchItem(admin, fries(), { priceCents: 9_999, isAvailable: false });
    await patchRestaurant(admin, burger(), { isAcceptingOrders: false });
    await seedCatalog(db);
    const detail = await menuOf(BURGER);
    expect(detail.isAcceptingOrders).toBe(true);
    const item = detail.menu.flatMap((c) => c.items).find((i) => i.id === fries());
    expect(item).toMatchObject({ isAvailable: true });
    expect(item?.priceCents).not.toBe(9_999);
  });
});
