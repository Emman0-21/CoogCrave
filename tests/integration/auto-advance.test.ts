import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/server/db/schema";
import {
  advanceDemoOrders,
  autoAdvanceEnabled,
  startAutoAdvance,
  STEP_SECONDS,
} from "@/server/demo/auto-advance";
import { transitionOrder } from "@/server/services/order-workflow";

import { signedInUser } from "../support/auth";
import { BURGER, LIBRARY } from "../support/delivery";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { type CookieJar, uniqueEmail } from "../support/http";
import { addToCart, checkout, clearOrdering, openAllWeek, seeded } from "../support/ordering";
import { seedCatalog } from "@/server/seed/catalog";

const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

/** Demo auto-advance (PRD Q3): the simulated restaurant, on a timer, for rehearsals only. */
describe("demo auto-advance", () => {
  let pool: Pool;
  let db: TestDb;
  let alex: CookieJar;

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    await seedCatalog(db);
    alex = await signedInUser(uniqueEmail("alex"));
  });
  beforeEach(async () => {
    await clearOrdering(db);
    await openAllWeek(db, seeded.restaurant(BURGER));
  });
  afterAll(async () => {
    await pool.end();
  });

  async function placeOrder(): Promise<string> {
    await addToCart(alex, { menuItemId: seeded.item(BURGER, "fries"), quantity: 3 });
    return (await checkout(alex, LIBRARY())).id;
  }
  const statusOf = async (orderId: string) =>
    (
      await db.select({ s: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, orderId))
    )[0]!.s;

  it("is only ever on outside production, and only when asked", () => {
    expect(autoAdvanceEnabled({ APP_ENV: "development", DEMO_AUTO_ADVANCE: false })).toBe(false);
    expect(autoAdvanceEnabled({ APP_ENV: "development", DEMO_AUTO_ADVANCE: true })).toBe(true);
    expect(autoAdvanceEnabled({ APP_ENV: "production", DEMO_AUTO_ADVANCE: true })).toBe(false);
  });

  it("confirms, then marks ready, one step per wait, as the simulated restaurant", async () => {
    const orderId = await placeOrder();
    expect(await advanceDemoOrders(db, later(STEP_SECONDS - 2))).toEqual({ advanced: 0, skipped: 0 });
    expect(await statusOf(orderId)).toBe("PLACED");

    expect(await advanceDemoOrders(db, later(STEP_SECONDS + 1))).toEqual({ advanced: 1, skipped: 0 });
    expect(await statusOf(orderId)).toBe("CONFIRMED");
    // Not ready in the same pass, and not until it has waited at CONFIRMED too.
    expect(await advanceDemoOrders(db, later(STEP_SECONDS - 2))).toEqual({ advanced: 0, skipped: 0 });
    expect(await advanceDemoOrders(db, later(STEP_SECONDS + 1))).toEqual({ advanced: 1, skipped: 0 });
    expect(await statusOf(orderId)).toBe("READY_FOR_PICKUP");
    // Nothing further: couriers take it from here.
    expect(await advanceDemoOrders(db, later(10 * STEP_SECONDS))).toEqual({ advanced: 0, skipped: 0 });

    const events = await db
      .select()
      .from(schema.orderStatusEvents)
      .where(eq(schema.orderStatusEvents.orderId, orderId));
    const automatic = events.filter((e) => e.actorType === "RESTAURANT_SIM");
    expect(automatic.map((e) => [e.toStatus, e.actorUserId])).toEqual([
      ["CONFIRMED", null],
      ["READY_FOR_PICKUP", null],
    ]);
    const notices = await db
      .select({ type: schema.notifications.type })
      .from(schema.notifications)
      .where(eq(schema.notifications.orderId, orderId));
    expect(notices.map((n) => n.type)).toEqual(expect.arrayContaining(["ORDER_CONFIRMED", "ORDER_READY"]));
  });

  it("leaves cancelled orders alone", async () => {
    const orderId = await placeOrder();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    await transitionOrder(db, {
      orderId,
      toStatus: "CANCELLED",
      actorType: "CUSTOMER",
      actorUserId: order!.customerId,
    });
    expect(await advanceDemoOrders(db, later(STEP_SECONDS + 1))).toEqual({ advanced: 0, skipped: 0 });
    expect(await statusOf(orderId)).toBe("CANCELLED");
  });

  it("never double-moves an order the Kitchen Console moves at the same moment, 10 rounds", async () => {
    for (let round = 0; round < 10; round++) {
      await clearOrdering(db);
      const orderId = await placeOrder();
      // Waiting long enough already, so the real clock decides; a fresh confirmation won't be "due".
      await db
        .update(schema.orders)
        .set({ statusUpdatedAt: sql`now() - interval '30 seconds'` })
        .where(eq(schema.orders.id, orderId));
      const [auto, kitchen] = await Promise.allSettled([
        advanceDemoOrders(db),
        transitionOrder(db, {
          orderId,
          toStatus: "CONFIRMED",
          actorType: "RESTAURANT_SIM",
          actorUserId: null,
          expectedVersion: 0,
        }),
      ]);
      expect(auto.status).toBe("fulfilled");
      const confirmations = await db
        .select()
        .from(schema.orderStatusEvents)
        .where(
          and(
            eq(schema.orderStatusEvents.orderId, orderId),
            eq(schema.orderStatusEvents.toStatus, "CONFIRMED"),
          ),
        );
      expect(confirmations).toHaveLength(1);
      expect(await statusOf(orderId)).toBe("CONFIRMED");
      // Exactly one of the two did it.
      const autoMoved = auto.status === "fulfilled" ? auto.value.advanced : 0;
      expect(autoMoved + (kitchen.status === "fulfilled" ? 1 : 0)).toBe(1);
    }
  });

  describe("the timer", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("runs one pass at a time, logs failures, and keeps going", async () => {
      const log = { info: vi.fn(), error: vi.fn() };
      let release: () => void = () => {};
      const pass = vi
        .fn<() => Promise<{ advanced: number; skipped: number }>>()
        .mockImplementationOnce(
          () => new Promise((resolve) => (release = () => resolve({ advanced: 2, skipped: 0 }))),
        )
        .mockRejectedValueOnce(new Error("database went away"))
        .mockResolvedValue({ advanced: 0, skipped: 0 });

      const stop = startAutoAdvance(log, 1000, pass);
      await vi.advanceTimersByTimeAsync(3000); // first pass still running: no overlap
      expect(pass).toHaveBeenCalledTimes(1);
      release();
      await vi.advanceTimersByTimeAsync(1000);
      expect(log.info).toHaveBeenCalledWith({ advanced: 2, skipped: 0 }, "demo auto-advance moved orders");
      await vi.advanceTimersByTimeAsync(1000);
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.any(String),
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(pass.mock.calls.length).toBeGreaterThanOrEqual(3);
      stop();
      const calls = pass.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(pass).toHaveBeenCalledTimes(calls);
    });
  });
});
