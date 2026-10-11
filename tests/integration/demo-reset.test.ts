import { eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { resetDemo } from "@/server/services/admin-ops";
import { recordAudit } from "@/server/services/audit";
import { seedCatalog } from "@/server/seed/catalog";
import { DEMO_ACCOUNTS, seedDemoAccounts } from "@/server/seed/demo";

import { signedInUser, signIn } from "../support/auth";
import { BURGER, readyOrder, transition } from "../support/delivery";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { uniqueEmail } from "../support/http";
import { addToCart, openAllWeek, seeded } from "../support/ordering";

const PASSWORD = "demo-reset-test-password-42";
const ON = { APP_ENV: "development" as const, DEMO_RESET_ENABLED: true };
const email = (key: string) => DEMO_ACCOUNTS.find((a) => a.key === key)!.email;

/** Demo reset (PRD ADM-10, THREAT_MODEL T-29): wipes demo accounts' activity, nobody else's. */
describe("demo reset", () => {
  let pool: Pool;
  let db: TestDb;
  let admin: Actor;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    await seedCatalog(db);
    await openAllWeek(db, seeded.restaurant(BURGER));
    await seedDemoAccounts(db, { password: PASSWORD, appEnv: "test" });
    for (const account of DEMO_ACCOUNTS) {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, account.email));
      ids[account.key] = user!.id;
    }
    admin = {
      userId: ids.admin!,
      name: "Ada Admin",
      email: email("admin"),
      role: "ADMIN",
      emailVerified: true,
      suspended: false,
      courier: null,
    };
  });
  afterAll(async () => {
    await pool.end();
  });

  it("is unavailable in production or when switched off, whatever the caller", async () => {
    await expect(
      resetDemo(admin, undefined, db, { APP_ENV: "development", DEMO_RESET_ENABLED: false }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      resetDemo(admin, undefined, db, { APP_ENV: "production", DEMO_RESET_ENABLED: true }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("removes demo accounts' orders, carts, and notifications, restores profiles and the catalog, and keeps everyone else's data", async () => {
    // A real student's order, which must survive.
    const outsider = await signedInUser(uniqueEmail("outsider"));
    const outsiderOrder = await readyOrder(outsider);

    // Demo activity: the demo customer orders and the demo courier delivers part of the way.
    const { jar: customer } = await signIn(email("customer"), PASSWORD);
    const { jar: courier } = await signIn(email("courier"), PASSWORD);
    await db
      .update(schema.courierProfiles)
      .set({ isOnline: true, onlineSince: new Date() })
      .where(eq(schema.courierProfiles.userId, ids.courier!));
    const demoOrder = await readyOrder(customer);
    expect((await transition(courier, demoOrder, { toStatus: "ASSIGNED" })).status).toBe(200);
    await addToCart(customer, { menuItemId: seeded.item(BURGER, "cheeseburger"), quantity: 1 });

    // Changes an admin might make while rehearsing.
    await db
      .update(schema.courierProfiles)
      .set({ status: "APPROVED", reviewNote: "ok", reviewedAt: new Date() })
      .where(eq(schema.courierProfiles.userId, ids.applicant!));
    await db.update(schema.users).set({ suspendedAt: new Date() }).where(eq(schema.users.id, ids.customer!));
    await db
      .update(schema.userProfiles)
      .set({ displayName: "Renamed" })
      .where(eq(schema.userProfiles.userId, ids.customer!));
    await db
      .update(schema.restaurants)
      .set({ isAcceptingOrders: false })
      .where(eq(schema.restaurants.id, seeded.restaurant(BURGER)));
    await db
      .update(schema.menuItems)
      .set({ isAvailable: false })
      .where(eq(schema.menuItems.id, seeded.item(BURGER, "fries")));
    await recordAudit(db, {
      by: { kind: "ADMIN", actor: admin },
      action: "user.suspend",
      targetType: "user",
      targetId: ids.customer!,
    });

    const result = await resetDemo(admin, "req-1", db, ON);
    expect(result).toMatchObject({
      removed: { orders: 1, carts: 1 },
      fixtures: { accounts: 4, restaurants: 11 },
    });
    expect(result.removed.notifications).toBeGreaterThanOrEqual(0);

    const remaining = await db.select({ id: schema.orders.id }).from(schema.orders);
    expect(remaining.map((o) => o.id)).toEqual([outsiderOrder]);
    expect(await db.select().from(schema.carts).where(eq(schema.carts.userId, ids.customer!))).toEqual([]);
    expect(
      await db
        .select()
        .from(schema.notifications)
        .where(inArray(schema.notifications.userId, Object.values(ids))),
    ).toEqual([]);
    // The outsider's notifications are untouched.
    expect((await db.select().from(schema.notifications)).length).toBeGreaterThan(0);

    const profiles = await db
      .select()
      .from(schema.courierProfiles)
      .where(inArray(schema.courierProfiles.userId, [ids.courier!, ids.applicant!]));
    expect(profiles.find((p) => p.userId === ids.applicant)).toMatchObject({
      status: "PENDING",
      reviewNote: null,
      reviewedAt: null,
      isOnline: false,
    });
    expect(profiles.find((p) => p.userId === ids.courier)).toMatchObject({
      status: "APPROVED",
      isOnline: false,
    });
    const [customerRow] = await db.select().from(schema.users).where(eq(schema.users.id, ids.customer!));
    expect(customerRow?.suspendedAt).toBeNull();
    const [profile] = await db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, ids.customer!));
    expect(profile?.displayName).toBeNull();

    const [restaurant] = await db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.id, seeded.restaurant(BURGER)));
    expect(restaurant?.isAcceptingOrders).toBe(true);
    const [fries] = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, seeded.item(BURGER, "fries")));
    expect(fries?.isAvailable).toBe(true);

    // The audit log keeps everything, including the reset itself.
    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.actorUserId, ids.admin!));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["user.suspend", "demo.reset"]));
    expect(audit.find((a) => a.action === "demo.reset")).toMatchObject({
      requestId: "req-1",
      metadata: expect.objectContaining({ accountsRestored: 4 }),
    });

    // Passwords are unchanged: the demo customer can still sign in.
    expect((await signIn(email("customer"), PASSWORD)).response.status).toBe(200);
  });
});
