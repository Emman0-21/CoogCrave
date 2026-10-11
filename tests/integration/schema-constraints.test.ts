import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";

import { openPool, resetDatabase } from "../support/db";
import {
  createCourier,
  createLocation,
  createRestaurantWithItem,
  createUser,
  createWorld,
  testDb,
  type TestDb,
  validOrderValues,
} from "../support/fixtures";
import { expectPgError, PG } from "../support/pg-errors";

/**
 * Database-level invariants (docs/DATABASE_DESIGN.md §4–5). Every insert runs as the app role, so these
 * prove the database itself refuses bad data even if application code has a bug.
 */
describe("schema constraints (as the app role)", () => {
  let pool: Pool;
  let db: TestDb;

  beforeAll(() => {
    pool = openPool("app");
    db = testDb(pool);
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await pool.end();
  });

  describe("users", () => {
    it("rejects duplicate and non-lowercase emails", async () => {
      await createUser(db, { email: "alex@cougarnet.uh.edu" });
      await expectPgError(createUser(db, { email: "alex@cougarnet.uh.edu" }), {
        code: PG.uniqueViolation,
        constraint: "users_email_unique",
      });
      await expectPgError(createUser(db, { email: "Alex@cougarnet.uh.edu" }), {
        code: PG.checkViolation,
        constraint: "users_email_lowercase",
      });
    });

    it("defaults new users to the STUDENT role", async () => {
      const user = await createUser(db);
      expect(user.role).toBe("STUDENT");
      expect(user.suspendedAt).toBeNull();
    });
  });

  describe("orders and pricing integrity", () => {
    it("rejects an order whose total isn't the sum of its parts (THREAT_MODEL T-08)", async () => {
      const w = await createWorld(db);
      const values = validOrderValues({
        customerId: w.customer.id,
        campusId: w.campus.id,
        restaurantId: w.restaurant.id,
        locationId: w.location.id,
      });
      await db.insert(schema.orders).values(values);
      await expectPgError(
        db.insert(schema.orders).values({
          ...values,
          orderNumber: "CC-TAMPER1",
          idempotencyKey: crypto.randomUUID(),
          totalCents: 1,
        }),
        { code: PG.checkViolation, constraint: "orders_total_is_sum" },
      );
    });

    it("rejects negative amounts and malformed order numbers", async () => {
      const w = await createWorld(db);
      const base = validOrderValues({
        customerId: w.customer.id,
        campusId: w.campus.id,
        restaurantId: w.restaurant.id,
        locationId: w.location.id,
      });
      await expectPgError(
        db.insert(schema.orders).values({ ...base, tipCents: -100, totalCents: base.totalCents! - 100 }),
        { code: PG.checkViolation, constraint: "orders_amounts_nonneg" },
      );
      await expectPgError(db.insert(schema.orders).values({ ...base, orderNumber: "1234" }), {
        code: PG.checkViolation,
        constraint: "orders_order_number_format",
      });
    });

    it("allows each idempotency key only once per customer (THREAT_MODEL T-10)", async () => {
      const w = await createWorld(db);
      const values = validOrderValues({
        customerId: w.customer.id,
        campusId: w.campus.id,
        restaurantId: w.restaurant.id,
        locationId: w.location.id,
      });
      await db.insert(schema.orders).values(values);
      await expectPgError(db.insert(schema.orders).values({ ...values, orderNumber: "CC-SECOND1" }), {
        code: PG.uniqueViolation,
        constraint: "orders_customer_idempotency_unique",
      });
      // A different customer may reuse the same key value.
      const other = await createUser(db);
      await db.insert(schema.orders).values({ ...values, orderNumber: "CC-OTHER01", customerId: other.id });
    });

    it("checks each order line's total and that the item belongs to the order's restaurant", async () => {
      const w = await createWorld(db);
      const [order] = await db
        .insert(schema.orders)
        .values(
          validOrderValues({
            customerId: w.customer.id,
            campusId: w.campus.id,
            restaurantId: w.restaurant.id,
            locationId: w.location.id,
          }),
        )
        .returning();
      const line = {
        orderId: order!.id,
        restaurantId: w.restaurant.id,
        menuItemId: w.item.id,
        nameSnapshot: "Test Burger",
        unitPriceCents: 899,
        optionsTotalCents: 150,
        quantity: 2,
        lineTotalCents: 2098,
      };
      await db.insert(schema.orderItems).values(line);
      await expectPgError(db.insert(schema.orderItems).values({ ...line, lineTotalCents: 999 }), {
        code: PG.checkViolation,
        constraint: "order_items_line_total",
      });

      const elsewhere = await createRestaurantWithItem(db, w.campus.id, w.location.id);
      await expectPgError(db.insert(schema.orderItems).values({ ...line, menuItemId: elsewhere.item.id }), {
        code: PG.foreignKeyViolation,
        constraint: "order_items_item_same_restaurant_fk",
      });
    });
  });

  describe("catalog and cart", () => {
    it("files menu items only under their own restaurant's categories", async () => {
      const w = await createWorld(db);
      const other = await createRestaurantWithItem(db, w.campus.id, w.location.id);
      await expectPgError(
        db.insert(schema.menuItems).values({
          restaurantId: w.restaurant.id,
          categoryId: other.category.id,
          name: "Misfiled",
          priceCents: 100,
        }),
        { code: PG.foreignKeyViolation, constraint: "menu_items_category_same_restaurant_fk" },
      );
    });

    it("keeps a cart to one restaurant at the database level", async () => {
      const w = await createWorld(db);
      const other = await createRestaurantWithItem(db, w.campus.id, w.location.id);
      const [cart] = await db
        .insert(schema.carts)
        .values({ userId: w.customer.id, restaurantId: w.restaurant.id })
        .returning();
      await db
        .insert(schema.cartItems)
        .values({ cartId: cart!.id, restaurantId: w.restaurant.id, menuItemId: w.item.id, quantity: 1 });

      // Item from another restaurant, labelled with that restaurant: the cart key doesn't match.
      await expectPgError(
        db.insert(schema.cartItems).values({
          cartId: cart!.id,
          restaurantId: other.restaurant.id,
          menuItemId: other.item.id,
          quantity: 1,
        }),
        { code: PG.foreignKeyViolation, constraint: "cart_items_cart_fk" },
      );
      // Same item, mislabelled with the cart's restaurant: the item key doesn't match.
      await expectPgError(
        db.insert(schema.cartItems).values({
          cartId: cart!.id,
          restaurantId: w.restaurant.id,
          menuItemId: other.item.id,
          quantity: 1,
        }),
        { code: PG.foreignKeyViolation, constraint: "cart_items_item_same_restaurant_fk" },
      );
      await expectPgError(
        db
          .insert(schema.cartItems)
          .values({ cartId: cart!.id, restaurantId: w.restaurant.id, menuItemId: w.item.id, quantity: 21 }),
        { code: PG.checkViolation, constraint: "cart_items_quantity_range" },
      );
    });

    it("validates opening hours", async () => {
      const w = await createWorld(db);
      const hours = { restaurantId: w.restaurant.id, dayOfWeek: 1, opensAtMinute: 600, closesAtMinute: 1320 };
      await db.insert(schema.restaurantHours).values(hours);
      // After-midnight closing is allowed up to 48:00.
      await db.insert(schema.restaurantHours).values({ ...hours, dayOfWeek: 5, closesAtMinute: 1560 });
      await expectPgError(db.insert(schema.restaurantHours).values({ ...hours, dayOfWeek: 7 }), {
        code: PG.checkViolation,
        constraint: "restaurant_hours_day_range",
      });
      await expectPgError(
        db.insert(schema.restaurantHours).values({ ...hours, dayOfWeek: 2, closesAtMinute: 500 }),
        { code: PG.checkViolation, constraint: "restaurant_hours_closes_after_opens" },
      );
    });
  });

  describe("couriers and assignments (THREAT_MODEL T-09)", () => {
    async function setup() {
      const w = await createWorld(db);
      const order = async () =>
        (
          await db
            .insert(schema.orders)
            .values({
              ...validOrderValues({
                customerId: w.customer.id,
                campusId: w.campus.id,
                restaurantId: w.restaurant.id,
                locationId: w.location.id,
              }),
              status: "READY_FOR_PICKUP",
            })
            .returning()
        )[0]!;
      const courierA = await createCourier(db, (await createUser(db)).id, { status: "APPROVED" });
      const courierB = await createCourier(db, (await createUser(db)).id, { status: "APPROVED" });
      return { order, courierA, courierB };
    }

    it("allows only approved couriers to be online", async () => {
      const user = await createUser(db);
      await expectPgError(createCourier(db, user.id, { status: "PENDING", isOnline: true }), {
        code: PG.checkViolation,
        constraint: "courier_profiles_online_requires_approval",
      });
      await createCourier(db, user.id, { status: "APPROVED", isOnline: true });
    });

    it("allows one active courier per order and one active order per courier", async () => {
      const { order, courierA, courierB } = await setup();
      const first = await order();
      const second = await order();

      await db.insert(schema.deliveryAssignments).values({ orderId: first.id, courierId: courierA.id });
      await expectPgError(
        db.insert(schema.deliveryAssignments).values({ orderId: first.id, courierId: courierB.id }),
        { code: PG.uniqueViolation, constraint: "delivery_assignments_one_active_per_order" },
      );
      await expectPgError(
        db.insert(schema.deliveryAssignments).values({ orderId: second.id, courierId: courierA.id }),
        { code: PG.uniqueViolation, constraint: "delivery_assignments_one_active_per_courier" },
      );
    });

    it("lets a released order be reassigned, keeping the history", async () => {
      const { order, courierA, courierB } = await setup();
      const o = await order();
      await db.insert(schema.deliveryAssignments).values({ orderId: o.id, courierId: courierA.id });
      await db
        .update(schema.deliveryAssignments)
        .set({ endedAt: new Date(), endReason: "RELEASED_BY_COURIER" })
        .where(eq(schema.deliveryAssignments.orderId, o.id));
      await db.insert(schema.deliveryAssignments).values({ orderId: o.id, courierId: courierB.id });
      const rows = await db
        .select()
        .from(schema.deliveryAssignments)
        .where(eq(schema.deliveryAssignments.orderId, o.id));
      expect(rows).toHaveLength(2);
    });

    it("keeps end fields consistent and payout only on delivered assignments", async () => {
      const { order, courierA } = await setup();
      const o = await order();
      await expectPgError(
        db
          .insert(schema.deliveryAssignments)
          .values({ orderId: o.id, courierId: courierA.id, endedAt: new Date() }),
        { code: PG.checkViolation, constraint: "delivery_assignments_end_consistent" },
      );
      await expectPgError(
        db.insert(schema.deliveryAssignments).values({
          orderId: o.id,
          courierId: courierA.id,
          endedAt: new Date(),
          endReason: "RELEASED_BY_COURIER",
          payoutCents: 500,
        }),
        { code: PG.checkViolation, constraint: "delivery_assignments_payout_only_when_delivered" },
      );
    });
  });

  describe("reviews", () => {
    it("allows one review per order with a 1–5 rating (THREAT_MODEL T-13)", async () => {
      const w = await createWorld(db);
      const courier = await createCourier(db, (await createUser(db)).id, { status: "APPROVED" });
      const [order] = await db
        .insert(schema.orders)
        .values({
          ...validOrderValues({
            customerId: w.customer.id,
            campusId: w.campus.id,
            restaurantId: w.restaurant.id,
            locationId: w.location.id,
          }),
          status: "DELIVERED",
        })
        .returning();
      const review = { orderId: order!.id, customerId: w.customer.id, courierId: courier.id, rating: 5 };
      await db.insert(schema.reviews).values(review);
      await expectPgError(db.insert(schema.reviews).values(review), {
        code: PG.uniqueViolation,
        constraint: "reviews_order_unique",
      });
      await expectPgError(db.insert(schema.reviews).values({ ...review, rating: 6 }), {
        code: PG.checkViolation,
      });
    });
  });

  describe("append-only history (THREAT_MODEL T-12, T-28)", () => {
    it("lets the app insert and read audit events but never change or delete them", async () => {
      const admin = await createUser(db, { role: "ADMIN" });
      const [event] = await db
        .insert(schema.auditEvents)
        .values({
          actorType: "ADMIN",
          actorUserId: admin.id,
          action: "courier.approve",
          targetType: "courier",
          targetId: "x",
        })
        .returning();
      expect(event!.metadata).toEqual({});

      await expectPgError(
        db
          .update(schema.auditEvents)
          .set({ action: "courier.reject" })
          .where(eq(schema.auditEvents.id, event!.id)),
        { code: PG.insufficientPrivilege },
      );
      await expectPgError(db.delete(schema.auditEvents).where(eq(schema.auditEvents.id, event!.id)), {
        code: PG.insufficientPrivilege,
      });
      await expectPgError(db.execute(sql`truncate audit_events`), { code: PG.insufficientPrivilege });
    });

    it("requires an admin user for ADMIN events and a dotted action name", async () => {
      await expectPgError(
        db
          .insert(schema.auditEvents)
          .values({ actorType: "ADMIN", action: "user.suspend", targetType: "user", targetId: "x" }),
        { code: PG.checkViolation, constraint: "audit_events_admin_has_user" },
      );
      await expectPgError(
        db
          .insert(schema.auditEvents)
          .values({ actorType: "SYSTEM", action: "Drop Table", targetType: "user", targetId: "x" }),
        { code: PG.checkViolation, constraint: "audit_events_action_format" },
      );
      await expectPgError(
        db
          .insert(schema.auditEvents)
          .values({ actorType: "CUSTOMER", action: "user.create", targetType: "user", targetId: "x" }),
        { code: PG.checkViolation, constraint: "audit_events_actor_kind" },
      );
      // CLI actions have no signed-in user.
      await db
        .insert(schema.auditEvents)
        .values({ actorType: "SYSTEM", action: "user.create_admin", targetType: "user", targetId: "x" });
    });

    it("protects order status history from edits, while deleting an order still removes its events", async () => {
      const w = await createWorld(db);
      const [order] = await db
        .insert(schema.orders)
        .values(
          validOrderValues({
            customerId: w.customer.id,
            campusId: w.campus.id,
            restaurantId: w.restaurant.id,
            locationId: w.location.id,
          }),
        )
        .returning();
      const [event] = await db
        .insert(schema.orderStatusEvents)
        .values({ orderId: order!.id, toStatus: "PLACED", actorType: "CUSTOMER", actorUserId: w.customer.id })
        .returning();

      await expectPgError(
        db
          .update(schema.orderStatusEvents)
          .set({ toStatus: "DELIVERED" })
          .where(eq(schema.orderStatusEvents.id, event!.id)),
        { code: PG.insufficientPrivilege },
      );
      await expectPgError(
        db.delete(schema.orderStatusEvents).where(eq(schema.orderStatusEvents.id, event!.id)),
        {
          code: PG.insufficientPrivilege,
        },
      );

      // Demo reset path: the cascade runs as the table owner, so the app can still delete the whole order.
      await db.delete(schema.orders).where(eq(schema.orders.id, order!.id));
      const remaining = await db.select().from(schema.orderStatusEvents);
      expect(remaining).toHaveLength(0);
    });

    it("requires a user for customer and courier status events", async () => {
      const w = await createWorld(db);
      const [order] = await db
        .insert(schema.orders)
        .values(
          validOrderValues({
            customerId: w.customer.id,
            campusId: w.campus.id,
            restaurantId: w.restaurant.id,
            locationId: w.location.id,
          }),
        )
        .returning();
      await expectPgError(
        db
          .insert(schema.orderStatusEvents)
          .values({ orderId: order!.id, toStatus: "PLACED", actorType: "CUSTOMER" }),
        { code: PG.checkViolation, constraint: "order_status_events_actor_user" },
      );
      await db.insert(schema.orderStatusEvents).values({
        orderId: order!.id,
        fromStatus: "PLACED",
        toStatus: "CONFIRMED",
        actorType: "RESTAURANT_SIM",
      });
    });
  });

  it("soft-deleted locations free their name for reuse", async () => {
    const w = await createWorld(db);
    const loc = await createLocation(db, w.campus.id, { name: "Agnes Arnold Hall" });
    await expectPgError(createLocation(db, w.campus.id, { name: "Agnes Arnold Hall" }), {
      code: PG.uniqueViolation,
      constraint: "campus_locations_name_unique",
    });
    await db
      .update(schema.campusLocations)
      .set({ deletedAt: new Date() })
      .where(eq(schema.campusLocations.id, loc.id));
    await createLocation(db, w.campus.id, { name: "Agnes Arnold Hall" });
  });
});
