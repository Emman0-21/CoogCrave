import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as quotePost } from "@/app/api/v1/checkout/quote/route";
import { GET as orderGet } from "@/app/api/v1/orders/[orderId]/route";
import { POST as transitionPost } from "@/app/api/v1/orders/[orderId]/transitions/route";
import { GET as ordersGet } from "@/app/api/v1/orders/route";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { seedCatalog } from "@/server/seed/catalog";
import { newOrderNumber, requestHash } from "@/server/services/checkout";
import { transitionOrder } from "@/server/services/order-workflow";
import type { OrderDetailView, OrderListView, QuoteView } from "@/shared/schemas/ordering";

import { signedInUser } from "../support/auth";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { appRequest, bodyOf, type CookieJar, uniqueEmail } from "../support/http";
import {
  addToCart,
  cartOf,
  checkout,
  clearOrdering,
  closeAllWeek,
  openAllWeek,
  placeOrderRequest,
  quoteFor,
  seeded,
  setItem,
} from "../support/ordering";

const BURGER = "the-burger-joint";
const params = (orderId: string) => ({ params: Promise.resolve({ orderId }) });
type ErrorBody = { error: { code: string; message: string; details: unknown } };

describe("checkout and orders", () => {
  let pool: Pool;
  let db: TestDb;
  let alex: CookieJar;
  let jordan: CookieJar;
  let library: string;

  /** Two bacon double cheeseburgers: the PRD's worked example (subtotal $20.98). */
  const fillCart = (jar: CookieJar) =>
    addToCart(jar, {
      menuItemId: seeded.item(BURGER, "double-cheeseburger"),
      quantity: 2,
      optionIds: [seeded.option(BURGER, "double-cheeseburger", "double-cheeseburger-addons", "bacon")],
      specialInstructions: "No onions",
    });

  const getOrder = async (jar: CookieJar, orderId: string) =>
    orderGet(appRequest(`/api/v1/orders/${orderId}`, { jar }), params(orderId));
  const transition = (jar: CookieJar, orderId: string, body: unknown) =>
    transitionPost(appRequest(`/api/v1/orders/${orderId}/transitions`, { body, jar }), params(orderId));

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    await seedCatalog(db);
    alex = await signedInUser(uniqueEmail("alex"));
    jordan = await signedInUser(uniqueEmail("jordan"));
    library = seeded.location("library");
  });
  beforeEach(async () => {
    await clearOrdering(db);
    await seedCatalog(db);
    await openAllWeek(db, seeded.restaurant(BURGER));
  });
  afterAll(async () => {
    await pool.end();
  });

  describe("quote (PRD ORD-1)", () => {
    it("prices the cart on the server and matches the documented worked example", async () => {
      await fillCart(alex);
      const quote = await quoteFor(alex, library, 300);
      expect(quote).toMatchObject({
        subtotalCents: 2098,
        deliveryFeeCents: 249,
        serviceFeeCents: 105,
        taxCents: 182,
        tipCents: 300,
        totalCents: 2934,
        taxIsSample: true,
        paymentMode: "DEMO",
        maxTipCents: 5000,
        canPlaceOrder: true,
        problems: [],
      });
      expect(quote.lines).toHaveLength(1);
    });

    it("refuses an empty cart, a building that isn't a drop point, and out-of-range tips", async () => {
      const ask = async (jar: CookieJar, body: unknown) => {
        const response = await quotePost(appRequest("/api/v1/checkout/quote", { body, jar }));
        return { status: response.status, code: (await bodyOf<ErrorBody>(response)).error?.code };
      };
      expect(await ask(alex, { deliveryLocationId: library, tipCents: 0 })).toEqual({
        status: 422,
        code: "CART_EMPTY",
      });
      await fillCart(alex);
      expect(await ask(alex, { deliveryLocationId: crypto.randomUUID(), tipCents: 0 })).toEqual({
        status: 422,
        code: "INVALID_LOCATION",
      });
      expect(await ask(alex, { deliveryLocationId: library, tipCents: 5001 })).toEqual({
        status: 422,
        code: "TIP_OUT_OF_RANGE",
      });
      expect((await ask(alex, { deliveryLocationId: library, tipCents: -1 })).status).toBe(400);
      expect((await ask(alex, { deliveryLocationId: library, tipCents: 1.5 })).status).toBe(400);
    });

    it("reports problems inline instead of failing, so the page can show them", async () => {
      await fillCart(alex);
      await closeAllWeek(db, seeded.restaurant(BURGER));
      const quote = await quoteFor(alex, library);
      expect(quote).toMatchObject({ canPlaceOrder: false, problems: ["RESTAURANT_CLOSED"] });
    });
  });

  describe("placing an order (PRD ORD-2…7)", () => {
    it("creates the order with snapshots, history, a simulated payment, and a notification, then empties the cart", async () => {
      await fillCart(alex);
      const order = await checkout(alex, library, {
        tipCents: 300,
        deliveryInstructions: "Meet at the bike racks",
      });

      expect(order).toMatchObject({
        viewer: "CUSTOMER",
        status: "PLACED",
        version: 0,
        restaurant: {
          slug: BURGER,
          name: "The Burger Joint",
          pickupLocation: "Retail, Auxiliary, and Dining (RAD) Center",
        },
        deliveryLocation: { id: library, name: "M.D. Anderson Memorial Library" },
        deliveryInstructions: "Meet at the bike racks",
        price: {
          subtotalCents: 2098,
          deliveryFeeCents: 249,
          serviceFeeCents: 105,
          taxCents: 182,
          tipCents: 300,
          totalCents: 2934,
        },
        payment: { mode: "DEMO", status: "AUTHORIZED" },
        allowedTransitions: [{ toStatus: "CANCELLED", actingAs: null, reasonRequired: false }],
      });
      expect(order.orderNumber).toMatch(/^CC-[0-9A-HJKMNP-TV-Z]{6}$/);
      expect(order.items).toEqual([
        {
          name: "Double cheeseburger",
          quantity: 2,
          unitPriceCents: 899,
          optionsTotalCents: 150,
          lineTotalCents: 2098,
          options: [{ group: "Add-ons", name: "Bacon", priceDeltaCents: 150 }],
          specialInstructions: "No onions",
        },
      ]);
      expect(order.timeline).toEqual([{ status: "PLACED", at: expect.any(String), actorType: "CUSTOMER" }]);

      const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
      expect(payment).toMatchObject({ provider: "DEMO", status: "AUTHORIZED", amountCents: 2934 });
      expect(payment!.providerReference).toMatch(/^demo_pi_[0-9a-f]{32}$/);
      const notices = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orderId, order.id));
      expect(notices.map((n) => n.type)).toEqual(["ORDER_PLACED"]);
      expect((await cartOf(alex)).items).toEqual([]);
    });

    it("keeps order history accurate after the menu changes (PRD ORD-5)", async () => {
      await fillCart(alex);
      const order = await checkout(alex, library);
      await setItem(db, BURGER, "double-cheeseburger", { name: "Renamed burger", priceCents: 1 });
      await db
        .update(schema.campusLocations)
        .set({ name: "Renamed library" })
        .where(eq(schema.campusLocations.id, library));
      const again = await bodyOf<OrderDetailView>(await getOrder(alex, order.id));
      expect(again.items[0]).toMatchObject({ name: "Double cheeseburger", unitPriceCents: 899 });
      expect(again.deliveryLocation.name).toBe("M.D. Anderson Memorial Library");
      expect(again.price).toEqual(order.price);
    });

    it("refuses a tampered or stale total and returns a fresh quote instead (PRD ORD-3, THREAT_MODEL T-08)", async () => {
      await fillCart(alex);
      const response = await placeOrderRequest(alex, {
        deliveryLocationId: library,
        tipCents: 0,
        expectedTotalCents: 1,
      });
      expect(response.status).toBe(409);
      const body = await bodyOf<{ error: { code: string; details: { quote: QuoteView } } }>(response);
      expect(body.error.code).toBe("PRICE_CHANGED");
      expect(body.error.details.quote.totalCents).toBe(2634);
      expect(await db.select().from(schema.orders)).toHaveLength(0);
      expect((await cartOf(alex)).items).toHaveLength(1);

      // Client-supplied prices aren't even accepted as input.
      const tampered = await placeOrderRequest(alex, {
        deliveryLocationId: library,
        tipCents: 0,
        expectedTotalCents: 2634,
        totalCents: 1,
      });
      expect(tampered.status).toBe(400);
    });

    it("refuses closed restaurants, unavailable items, small orders, and empty carts (PRD ORD-6)", async () => {
      const attempt = async () => {
        const response = await placeOrderRequest(alex, {
          deliveryLocationId: library,
          tipCents: 0,
          expectedTotalCents: 2634,
        });
        return { status: response.status, code: (await bodyOf<ErrorBody>(response)).error?.code };
      };
      expect(await attempt()).toEqual({ status: 422, code: "CART_EMPTY" });
      await fillCart(alex);
      await closeAllWeek(db, seeded.restaurant(BURGER));
      expect(await attempt()).toEqual({ status: 422, code: "RESTAURANT_CLOSED" });
      await openAllWeek(db, seeded.restaurant(BURGER));
      await db
        .update(schema.restaurants)
        .set({ isAcceptingOrders: false })
        .where(eq(schema.restaurants.id, seeded.restaurant(BURGER)));
      expect(await attempt()).toEqual({ status: 422, code: "RESTAURANT_CLOSED" });
      await db
        .update(schema.restaurants)
        .set({ isAcceptingOrders: true })
        .where(eq(schema.restaurants.id, seeded.restaurant(BURGER)));
      await setItem(db, BURGER, "double-cheeseburger", { isAvailable: false });
      expect(await attempt()).toEqual({ status: 422, code: "ITEM_UNAVAILABLE" });
      await setItem(db, BURGER, "double-cheeseburger", { isAvailable: true });
      expect(await db.select().from(schema.orders)).toHaveLength(0);
    });

    it("needs an Idempotency-Key and never creates two orders for one checkout attempt (PRD ORD-4, THREAT_MODEL T-10)", async () => {
      await fillCart(alex);
      const body = { deliveryLocationId: library, tipCents: 0, expectedTotalCents: 2634 };
      const missing = await placeOrderRequest(alex, body, null);
      expect(missing.status).toBe(400);
      expect((await bodyOf<ErrorBody>(missing)).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect((await placeOrderRequest(alex, body, "not-a-uuid")).status).toBe(400);

      const key = crypto.randomUUID();
      const first = await placeOrderRequest(alex, body, key);
      expect(first.status).toBe(201);
      const firstOrder = await bodyOf<OrderDetailView>(first);

      const retry = await placeOrderRequest(alex, body, key);
      expect(retry.status).toBe(200);
      expect(retry.headers.get("idempotent-replayed")).toBe("true");
      expect((await bodyOf<OrderDetailView>(retry)).id).toBe(firstOrder.id);

      const reused = await placeOrderRequest(alex, { ...body, tipCents: 100 }, key);
      expect(reused.status).toBe(422);
      expect((await bodyOf<ErrorBody>(reused)).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(await db.select().from(schema.orders)).toHaveLength(1);
    });

    it("turns simultaneous double-submits into one order (THREAT_MODEL T-10)", async () => {
      await fillCart(alex);
      const key = crypto.randomUUID();
      const body = { deliveryLocationId: library, tipCents: 0, expectedTotalCents: 2634 };
      const responses = await Promise.all([1, 2, 3, 4, 5].map(() => placeOrderRequest(alex, body, key)));
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 200, 200, 200, 201]);
      const ids = new Set(
        await Promise.all(responses.map(async (r) => (await bodyOf<OrderDetailView>(r)).id)),
      );
      expect(ids.size).toBe(1);
      expect(await db.select().from(schema.orders)).toHaveLength(1);
      expect(await db.select().from(schema.payments)).toHaveLength(1);
    });

    it("hashes the checkout fields deterministically and makes readable order numbers", () => {
      const input = {
        deliveryLocationId: library,
        deliveryInstructions: null,
        tipCents: 0,
        expectedTotalCents: 1,
      };
      expect(requestHash(input)).toBe(requestHash({ ...input }));
      expect(requestHash(input)).not.toBe(requestHash({ ...input, tipCents: 1 }));
      for (let i = 0; i < 200; i++) expect(newOrderNumber()).toMatch(/^CC-[0-9A-HJKMNP-TV-Z]{6}$/);
    });
  });

  describe("history, tracking, and cancelling (PRD ORD-7…9, TRK-1)", () => {
    it("shows customers only their own orders; everyone else gets 404 (THREAT_MODEL T-01)", async () => {
      await fillCart(alex);
      const order = await checkout(alex, library);

      expect((await getOrder(alex, order.id)).status).toBe(200);
      expect((await getOrder(jordan, order.id)).status).toBe(404);
      expect((await getOrder(alex, crypto.randomUUID())).status).toBe(404);
      expect(
        (
          await orderGet(appRequest("/api/v1/orders/not-a-uuid", { jar: alex }), {
            params: Promise.resolve({ orderId: "not-a-uuid" }),
          })
        ).status,
      ).toBe(404);
      expect((await transition(jordan, order.id, { toStatus: "CANCELLED" })).status).toBe(404);

      const jordansList = await bodyOf<OrderListView>(
        await ordersGet(appRequest("/api/v1/orders", { jar: jordan })),
      );
      expect(jordansList.data).toEqual([]);
      const body = await bodyOf<OrderDetailView>(await getOrder(alex, order.id));
      expect(JSON.stringify(body)).not.toMatch(/customerId|email|idempotency|requestHash|providerReference/i);
    });

    it("lets the customer cancel while the order is PLACED, voiding the simulated payment", async () => {
      await fillCart(alex);
      const order = await checkout(alex, library);
      const response = await transition(alex, order.id, { toStatus: "CANCELLED" });
      expect(response.status).toBe(200);
      const cancelled = await bodyOf<OrderDetailView>(response);
      expect(cancelled).toMatchObject({
        status: "CANCELLED",
        version: 1,
        payment: { status: "VOIDED" },
        allowedTransitions: [],
      });
      expect(cancelled.timeline.map((t) => [t.status, t.actorType])).toEqual([
        ["PLACED", "CUSTOMER"],
        ["CANCELLED", "CUSTOMER"],
      ]);
      const notices = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orderId, order.id));
      expect(notices.map((n) => n.type).sort()).toEqual(["ORDER_CANCELLED", "ORDER_PLACED"]);

      const again = await transition(alex, order.id, { toStatus: "CANCELLED" });
      expect(again.status).toBe(409);
      expect(await bodyOf(again)).toMatchObject({
        error: { code: "INVALID_TRANSITION", details: { currentStatus: "CANCELLED" } },
      });
    });

    it("can't be cancelled by the customer once the restaurant confirms, and customers can't move orders forward (THREAT_MODEL T-04)", async () => {
      await fillCart(alex);
      const order = await checkout(alex, library);
      for (const toStatus of ["CONFIRMED", "READY_FOR_PICKUP", "DELIVERED", "PLACED"]) {
        const response = await transition(alex, order.id, { toStatus });
        expect(response.status, toStatus).toBe(409);
      }
      expect(
        (await transition(alex, order.id, { toStatus: "CONFIRMED", actingAs: "RESTAURANT_SIM" })).status,
      ).toBe(403);

      await transitionOrder(getDb(), {
        orderId: order.id,
        toStatus: "CONFIRMED",
        actorType: "RESTAURANT_SIM",
        actorUserId: null,
      });
      const confirmed = await bodyOf<OrderDetailView>(await getOrder(alex, order.id));
      expect(confirmed).toMatchObject({ status: "CONFIRMED", allowedTransitions: [] });
      const refused = await transition(alex, order.id, { toStatus: "CANCELLED" });
      expect(refused.status).toBe(409);
      expect((await bodyOf<ErrorBody>(refused)).error.message).toMatch(/already started/);
    });

    it("detects a stale page with expectedVersion (STALE_STATE)", async () => {
      await fillCart(alex);
      const order = await checkout(alex, library);
      const stale = await transition(alex, order.id, { toStatus: "CANCELLED", expectedVersion: 5 });
      expect(stale.status).toBe(409);
      expect((await bodyOf<ErrorBody>(stale)).error.code).toBe("STALE_STATE");
      expect((await transition(alex, order.id, { toStatus: "CANCELLED", expectedVersion: 0 })).status).toBe(
        200,
      );
    });

    it("lets exactly one of a customer cancel and a restaurant confirm win a race (THREAT_MODEL T-11)", async () => {
      await fillCart(alex);
      const order = await checkout(alex, library);

      // Force the worst interleaving: hold a row lock so both changes read PLACED, then both try to
      // write. Without compare-and-set, both writes would land when the lock is released.
      const gate = await pool.connect();
      try {
        await gate.query("begin");
        await gate.query("select 1 from orders where id = $1 for update", [order.id]);
        const racing = Promise.allSettled([
          transition(alex, order.id, { toStatus: "CANCELLED" }),
          transitionOrder(getDb(), {
            orderId: order.id,
            toStatus: "CONFIRMED",
            actorType: "RESTAURANT_SIM",
            actorUserId: null,
          }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 300)); // both are now waiting on the lock
        await gate.query("commit");
        const [cancel, confirm] = await racing;

        const cancelled = cancel.status === "fulfilled" && cancel.value.status === 200;
        const confirmed = confirm.status === "fulfilled";
        expect(cancelled !== confirmed).toBe(true);
        const loserCode =
          cancel.status === "fulfilled" && cancel.value.status !== 200
            ? (await bodyOf<ErrorBody>(cancel.value)).error.code
            : confirm.status === "rejected"
              ? (confirm.reason as { code?: string }).code
              : null;
        expect(loserCode).toBe("STALE_STATE");
      } finally {
        gate.release();
      }
      const events = await db
        .select()
        .from(schema.orderStatusEvents)
        .where(eq(schema.orderStatusEvents.orderId, order.id));
      expect(events).toHaveLength(2);
    });

    it("records the restaurant's simulated steps on the timeline and notifies the customer", async () => {
      await fillCart(alex);
      const order = await checkout(alex, library);
      await transitionOrder(getDb(), {
        orderId: order.id,
        toStatus: "CONFIRMED",
        actorType: "RESTAURANT_SIM",
        actorUserId: null,
      });
      await transitionOrder(getDb(), {
        orderId: order.id,
        toStatus: "READY_FOR_PICKUP",
        actorType: "RESTAURANT_SIM",
        actorUserId: null,
      });
      const tracked = await bodyOf<OrderDetailView>(await getOrder(alex, order.id));
      expect(tracked.timeline.map((t) => t.status)).toEqual(["PLACED", "CONFIRMED", "READY_FOR_PICKUP"]);
      expect(tracked).toMatchObject({ status: "READY_FOR_PICKUP", version: 2 });
      const notices = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orderId, order.id));
      expect(notices.map((n) => n.type).sort()).toEqual(["ORDER_CONFIRMED", "ORDER_PLACED", "ORDER_READY"]);
    });

    it("lists orders newest first, split into active and past, a page at a time (PRD ORD-8)", async () => {
      const placed: OrderDetailView[] = [];
      for (let i = 0; i < 3; i++) {
        await fillCart(alex);
        placed.push(await checkout(alex, library));
      }
      await transition(alex, placed[0]!.id, { toStatus: "CANCELLED" });

      const list = async (query: string) =>
        bodyOf<OrderListView>(await ordersGet(appRequest(`/api/v1/orders${query}`, { jar: alex })));
      const all = await list("");
      expect(all.data.map((o) => o.id)).toEqual([placed[2]!.id, placed[1]!.id, placed[0]!.id]);
      expect(all.data[0]).toMatchObject({
        restaurantName: "The Burger Joint",
        status: "PLACED",
        itemCount: 2,
        totalCents: 2634,
      });
      expect((await list("?scope=active")).data.map((o) => o.id)).toEqual([placed[2]!.id, placed[1]!.id]);
      expect((await list("?scope=past")).data.map((o) => o.id)).toEqual([placed[0]!.id]);

      const first = await list("?limit=2");
      expect(first.data).toHaveLength(2);
      const second = await list(`?limit=2&cursor=${first.nextCursor}`);
      expect(second.data.map((o) => o.id)).toEqual([placed[0]!.id]);
      expect(second.nextCursor).toBeNull();
      expect((await ordersGet(appRequest("/api/v1/orders?cursor=bogus", { jar: alex }))).status).toBe(400);
      expect((await ordersGet(appRequest("/api/v1/orders?scope=everything", { jar: alex }))).status).toBe(
        400,
      );
    });
  });
});
