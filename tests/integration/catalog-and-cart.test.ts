import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DELETE as cartDelete } from "@/app/api/v1/cart/route";
import { DELETE as cartItemDelete, PATCH as cartItemPatch } from "@/app/api/v1/cart/items/[cartItemId]/route";
import { GET as cuisinesGet } from "@/app/api/v1/cuisines/route";
import { GET as restaurantGet } from "@/app/api/v1/restaurants/[slug]/route";
import { GET as restaurantsGet } from "@/app/api/v1/restaurants/route";
import * as schema from "@/server/db/schema";
import { seedCatalog } from "@/server/seed/catalog";
import { likePattern, restaurantOpenStatus } from "@/server/services/catalog";
import type { CartView, RestaurantDetail, RestaurantSummary } from "@/shared/schemas/ordering";

import { signedInUser } from "../support/auth";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { appRequest, bodyOf, type CookieJar, uniqueEmail } from "../support/http";
import {
  addToCart,
  cartOf,
  clearOrdering,
  closeAllWeek,
  openAllWeek,
  seeded,
  setItem,
} from "../support/ordering";

const BURGER = "the-burger-joint";
const TACO = "the-taco-stand";
const ADDONS = (option: string) =>
  seeded.option(BURGER, "double-cheeseburger", "double-cheeseburger-addons", option);
const FLAVOR = (option: string) => seeded.option(BURGER, "milkshake", "milkshake-flavor", option);

const params = (value: Record<string, string>) => ({ params: Promise.resolve(value) });

async function listRestaurants(query = ""): Promise<{ status: number; data: RestaurantSummary[] }> {
  const response = await restaurantsGet(appRequest(`/api/v1/restaurants${query}`));
  const body = await bodyOf<{ data: RestaurantSummary[] }>(response);
  return { status: response.status, data: body.data };
}

describe("catalog and cart", () => {
  let pool: Pool;
  let db: TestDb;
  let alex: CookieJar;
  let jordan: CookieJar;

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    await seedCatalog(db);
    alex = await signedInUser(uniqueEmail("alex"));
    jordan = await signedInUser(uniqueEmail("jordan"));
  });
  beforeEach(async () => {
    await clearOrdering(db);
    await seedCatalog(db); // restores any menu edits a test made
    for (const key of [BURGER, TACO, "katz-coffee"]) await openAllWeek(db, seeded.restaurant(key));
  });
  afterAll(async () => {
    await pool.end();
  });

  describe("restaurant discovery (PRD CAT-1…6)", () => {
    it("lists every restaurant as sample data, with cuisines and pickup building, orderable ones first", async () => {
      await closeAllWeek(db, seeded.restaurant("starbucks"));
      const { status, data } = await listRestaurants();
      expect(status).toBe(200);
      expect(data).toHaveLength(11);
      expect(data.every((r) => r.isSampleData)).toBe(true);
      const burger = data.find((r) => r.slug === BURGER)!;
      expect(burger).toMatchObject({
        name: "The Burger Joint",
        cuisines: [{ slug: "burgers", name: "Burgers" }],
        location: { shortName: "RAD Center" },
        isOpenNow: true,
        canOrder: true,
        closesAtMinute: 0,
        nextOpenAt: null,
      });
      const firstClosed = data.findIndex((r) => !r.canOrder);
      expect(data.slice(firstClosed).every((r) => !r.canOrder)).toBe(true);
      expect(data.find((r) => r.slug === "starbucks")).toMatchObject({ isOpenNow: false, canOrder: false });
      // The response is public catalog data only.
      expect(JSON.stringify(data)).not.toMatch(/email|customer|deleted/i);
    });

    it("searches restaurant names and menu items, and shows which items matched", async () => {
      const { data } = await listRestaurants("?q=burrito");
      expect(data.map((r) => r.slug)).toEqual([TACO]);
      expect(data[0]!.matchingItems).toEqual(["Bean and cheese burrito"]);
      expect((await listRestaurants("?q=katz")).data.map((r) => r.slug)).toEqual(["katz-coffee"]);
      // LIKE wildcards are matched literally, not as "anything".
      expect((await listRestaurants("?q=%25")).data).toEqual([]);
      expect((await listRestaurants("?q=_")).data).toEqual([]);
      expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
    });

    it("filters by one or more cuisines and by 'open now'", async () => {
      const coffee = await listRestaurants("?cuisine=coffee");
      expect(coffee.data.map((r) => r.slug).sort()).toEqual(["katz-coffee", "starbucks"]);
      const either = await listRestaurants("?cuisine=coffee&cuisine=desserts");
      expect(either.data.map((r) => r.slug).sort()).toEqual(["katz-coffee", "shastas-cones", "starbucks"]);

      for (const r of await db.select().from(schema.restaurants)) await closeAllWeek(db, r.id);
      await openAllWeek(db, seeded.restaurant(BURGER));
      await openAllWeek(db, seeded.restaurant(TACO));
      await db
        .update(schema.restaurants)
        .set({ isAcceptingOrders: false })
        .where(eq(schema.restaurants.id, seeded.restaurant(TACO)));
      const open = await listRestaurants("?openNow=true");
      expect(open.data.map((r) => r.slug)).toEqual([BURGER]);
      await db
        .update(schema.restaurants)
        .set({ isAcceptingOrders: true })
        .where(eq(schema.restaurants.id, seeded.restaurant(TACO)));
    });

    it("rejects malformed filters", async () => {
      expect((await listRestaurants("?q=" + "a".repeat(61))).status).toBe(400);
      expect((await listRestaurants("?cuisine=Not%20A%20Slug")).status).toBe(400);
      expect((await listRestaurants("?sort=price")).status).toBe(400);
    });

    it("shows a restaurant's hours and menu, with unavailable items still listed", async () => {
      const response = await restaurantGet(
        appRequest("/api/v1/restaurants/katz-coffee"),
        params({ slug: "katz-coffee" }),
      );
      expect(response.status).toBe(200);
      const detail = await bodyOf<RestaurantDetail>(response);
      expect(detail).toMatchObject({ name: "Katz Coffee", timeZone: "America/Chicago", isSampleData: true });
      expect(detail.hours).toHaveLength(7);
      expect(detail.menu.map((c) => c.name)).toEqual(["Coffee and tea", "Pastries"]);
      const latte = detail.menu[0]!.items.find((i) => i.name === "Latte")!;
      expect(latte.optionGroups.map((g) => [g.name, g.minSelect, g.maxSelect, g.options.length])).toEqual([
        ["Size", 1, 1, 2],
        ["Milk", 1, 1, 2],
      ]);
      expect(detail.menu[1]!.items.find((i) => i.name === "Blueberry muffin")).toMatchObject({
        isAvailable: false,
      });
    });

    it("hides deleted menu items and restaurants, and answers 404 for unknown or malformed slugs", async () => {
      await setItem(db, BURGER, "fries", { deletedAt: new Date() });
      const detail = await bodyOf<RestaurantDetail>(
        await restaurantGet(appRequest(`/api/v1/restaurants/${BURGER}`), params({ slug: BURGER })),
      );
      expect(detail.menu.flatMap((c) => c.items.map((i) => i.name))).not.toContain("Fries");

      await db
        .update(schema.restaurants)
        .set({ deletedAt: new Date() })
        .where(eq(schema.restaurants.id, seeded.restaurant("asado")));
      expect(
        (await restaurantGet(appRequest("/api/v1/restaurants/asado"), params({ slug: "asado" }))).status,
      ).toBe(404);
      expect((await listRestaurants()).data.map((r) => r.slug)).not.toContain("asado");
      for (const slug of ["no-such-place", "Bad Slug", "../etc"]) {
        expect(
          (await restaurantGet(appRequest(`/api/v1/restaurants/x`), params({ slug }))).status,
          slug,
        ).toBe(404);
      }
    });

    it("lists only cuisines in use", async () => {
      const body = await bodyOf<{ data: { slug: string }[] }>(
        await cuisinesGet(appRequest("/api/v1/cuisines")),
      );
      expect(body.data.map((c) => c.slug)).toContain("burgers");
      expect(body.data.map((c) => c.slug)).not.toContain("pizza");
    });

    it("counts a restaurant as orderable only when its hours say open and it's accepting orders", () => {
      const allDay = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        opensAtMinute: 0,
        closesAtMinute: 1440,
      }));
      const now = new Date("2026-10-14T17:00:00Z");
      expect(restaurantOpenStatus(allDay, true, "America/Chicago", now)).toMatchObject({
        isOpenNow: true,
        canOrder: true,
      });
      expect(restaurantOpenStatus(allDay, false, "America/Chicago", now)).toMatchObject({
        isOpenNow: true,
        canOrder: false,
      });
      expect(restaurantOpenStatus([], true, "America/Chicago", now)).toMatchObject({
        isOpenNow: false,
        canOrder: false,
        nextOpenAt: null,
      });
    });
  });

  describe("cart (PRD CART-1…4)", () => {
    const addBurger = (jar: CookieJar, extra: Record<string, unknown> = {}) =>
      addToCart(jar, {
        menuItemId: seeded.item(BURGER, "double-cheeseburger"),
        quantity: 2,
        optionIds: [ADDONS("bacon")],
        ...extra,
      });

    it("adds an item with options and prices it on the server", async () => {
      const response = await addBurger(alex, { specialInstructions: "  No onions  " });
      expect(response.status).toBe(201);
      const cart = await bodyOf<CartView>(response);
      expect(cart.restaurant).toMatchObject({ slug: BURGER, isOpenNow: true });
      expect(cart.items).toEqual([
        expect.objectContaining({
          name: "Double cheeseburger",
          quantity: 2,
          unitPriceCents: 899,
          optionsTotalCents: 150,
          lineTotalCents: 2098,
          options: [expect.objectContaining({ group: "Add-ons", name: "Bacon", priceDeltaCents: 150 })],
          specialInstructions: "No onions",
          problems: [],
        }),
      ]);
      expect(cart).toMatchObject({ itemCount: 2, subtotalCents: 2098, canCheckout: true, problems: [] });
    });

    it("merges identical lines (capped at 20) and keeps different choices separate", async () => {
      await addBurger(alex);
      await addBurger(alex, { optionIds: [ADDONS("bacon")], quantity: 19 });
      await addBurger(alex, { optionIds: [ADDONS("egg"), ADDONS("bacon")] });
      await addBurger(alex, { specialInstructions: "Extra pickles" });
      const cart = await cartOf(alex);
      expect(
        cart.items.map((i) => [i.quantity, i.options.map((o) => o.name).join("+"), i.specialInstructions]),
      ).toEqual([
        [20, "Bacon", null],
        [2, "Bacon+Fried egg", null],
        [2, "Bacon", "Extra pickles"],
      ]);
    });

    it("enforces option rules and availability on the server", async () => {
      const shake = (optionIds: string[]) =>
        addToCart(alex, { menuItemId: seeded.item(BURGER, "milkshake"), quantity: 1, optionIds });
      const missing = await shake([]);
      expect(missing.status).toBe(422);
      expect((await bodyOf<{ error: { code: string; message: string } }>(missing)).error).toMatchObject({
        code: "INVALID_OPTIONS",
        message: "Choose an option for Flavor.",
      });
      expect((await shake([FLAVOR("vanilla"), FLAVOR("chocolate")])).status).toBe(422);
      expect((await shake([ADDONS("bacon")])).status).toBe(422); // another item's option
      expect((await shake([FLAVOR("vanilla"), FLAVOR("vanilla")])).status).toBe(422);
      expect((await shake([FLAVOR("vanilla")])).status).toBe(201);

      await setItem(db, BURGER, "fries", { isAvailable: false });
      const fries = await addToCart(alex, { menuItemId: seeded.item(BURGER, "fries"), quantity: 1 });
      expect(fries.status).toBe(422);
      expect((await bodyOf<{ error: { code: string } }>(fries)).error.code).toBe("ITEM_UNAVAILABLE");
      expect((await addToCart(alex, { menuItemId: crypto.randomUUID(), quantity: 1 })).status).toBe(404);
    });

    it("never accepts prices, out-of-range quantities, or extra fields from the client (THREAT_MODEL T-08)", async () => {
      const base = { menuItemId: seeded.item(BURGER, "fries"), quantity: 1 };
      expect((await addToCart(alex, { ...base, priceCents: 1 })).status).toBe(400);
      expect((await addToCart(alex, { ...base, quantity: 0 })).status).toBe(400);
      expect((await addToCart(alex, { ...base, quantity: 21 })).status).toBe(400);
      expect((await addToCart(alex, { ...base, quantity: 1.5 })).status).toBe(400);
      expect((await addToCart(alex, { ...base, specialInstructions: "<script>" })).status).toBe(400);
      expect((await addToCart(alex, { ...base, specialInstructions: "x".repeat(141) })).status).toBe(400);
    });

    it("keeps a cart to one restaurant unless the customer chooses to start over", async () => {
      await addBurger(alex);
      const taco = { menuItemId: seeded.item(TACO, "bean-cheese-burrito"), quantity: 1 };
      const conflict = await addToCart(alex, taco);
      expect(conflict.status).toBe(409);
      expect(await bodyOf(conflict)).toMatchObject({
        error: {
          code: "CART_RESTAURANT_CONFLICT",
          details: { currentRestaurant: { name: "The Burger Joint" } },
        },
      });
      const replaced = await addToCart(alex, { ...taco, replaceCart: true });
      expect(replaced.status).toBe(201);
      const cart = await bodyOf<CartView>(replaced);
      expect(cart.restaurant?.slug).toBe(TACO);
      expect(cart.items.map((i) => i.name)).toEqual(["Bean and cheese burrito"]);
    });

    it("changes quantities and removes lines, only in the caller's own cart", async () => {
      const cart = await bodyOf<CartView>(await addBurger(alex));
      const lineId = cart.items[0]!.id;
      const patch = (jar: CookieJar, body: unknown) =>
        cartItemPatch(
          appRequest(`/api/v1/cart/items/${lineId}`, { method: "PATCH", body, jar }),
          params({ cartItemId: lineId }),
        );

      expect((await patch(jordan, { quantity: 5 })).status).toBe(404);
      expect(
        (
          await cartItemDelete(
            appRequest(`/api/v1/cart/items/${lineId}`, { method: "DELETE", jar: jordan }),
            params({ cartItemId: lineId }),
          )
        ).status,
      ).toBe(404);
      expect((await patch(alex, { quantity: 21 })).status).toBe(400);
      const updated = await bodyOf<CartView>(await patch(alex, { quantity: 5 }));
      expect(updated.items[0]).toMatchObject({ quantity: 5, lineTotalCents: 5245 });

      const removed = await cartItemDelete(
        appRequest(`/api/v1/cart/items/${lineId}`, { method: "DELETE", jar: alex }),
        params({ cartItemId: lineId }),
      );
      expect(await bodyOf<CartView>(removed)).toMatchObject({
        restaurant: null,
        items: [],
        canCheckout: false,
      });
      expect(await db.select().from(schema.carts)).toHaveLength(0);
    });

    it("empties the whole cart", async () => {
      await addBurger(alex);
      await addBurger(jordan);
      const response = await cartDelete(appRequest("/api/v1/cart", { method: "DELETE", jar: alex }));
      expect(await bodyOf<CartView>(response)).toMatchObject({ items: [], restaurant: null });
      expect((await cartOf(jordan)).items).toHaveLength(1); // only the caller's cart
    });

    it("re-prices on every read and flags anything that blocks checkout (PRD CART-4)", async () => {
      await addBurger(alex);
      await setItem(db, BURGER, "double-cheeseburger", { priceCents: 999 });
      expect((await cartOf(alex)).items[0]).toMatchObject({ unitPriceCents: 999, lineTotalCents: 2298 });

      await setItem(db, BURGER, "double-cheeseburger", { isAvailable: false });
      const unavailable = await cartOf(alex);
      expect(unavailable.items[0]!.problems).toEqual(["ITEM_UNAVAILABLE"]);
      expect(unavailable).toMatchObject({ canCheckout: false, problems: ["ITEM_PROBLEMS"] });

      await setItem(db, BURGER, "double-cheeseburger", { isAvailable: true });
      await db
        .update(schema.menuOptions)
        .set({ isAvailable: false })
        .where(eq(schema.menuOptions.id, ADDONS("bacon")));
      expect((await cartOf(alex)).items[0]!.problems).toEqual(["ITEM_UNAVAILABLE"]);

      await seedCatalog(db);
      await openAllWeek(db, seeded.restaurant(BURGER));
      await closeAllWeek(db, seeded.restaurant(BURGER));
      expect(await cartOf(alex)).toMatchObject({ canCheckout: false, problems: ["RESTAURANT_CLOSED"] });
    });

    it("requires the minimum subtotal before checkout", async () => {
      await addToCart(alex, { menuItemId: seeded.item(BURGER, "fries"), quantity: 1 });
      const cart = await cartOf(alex);
      expect(cart).toMatchObject({
        subtotalCents: 349,
        minSubtotalCents: 500,
        canCheckout: false,
        problems: ["BELOW_MINIMUM_SUBTOTAL"],
      });
      const [line] = cart.items;
      await cartItemPatch(
        appRequest(`/api/v1/cart/items/${line!.id}`, { method: "PATCH", body: { quantity: 2 }, jar: alex }),
        params({ cartItemId: line!.id }),
      );
      expect(await cartOf(alex)).toMatchObject({ subtotalCents: 698, canCheckout: true, problems: [] });
    });

    it("handles simultaneous first adds to an empty cart without errors or duplicate carts", async () => {
      const responses = await Promise.all(
        [1, 2, 3, 4].map(() => addToCart(alex, { menuItemId: seeded.item(BURGER, "fries"), quantity: 1 })),
      );
      expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(await db.select().from(schema.carts)).toHaveLength(1);
      expect((await cartOf(alex)).items).toEqual([expect.objectContaining({ quantity: 4 })]);
    });
  });
});
