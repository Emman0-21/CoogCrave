import { count, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as auditGet } from "@/app/api/v1/admin/audit-events/route";
import { createOrPromoteAdmin } from "@/server/accounts/accounts";
import * as schema from "@/server/db/schema";
import { seedCatalog } from "@/server/seed/catalog";
import { RESTAURANTS } from "@/server/seed/catalog-data";
import { DEMO_ACCOUNTS, DemoSeedRefused, seedDemoAccounts } from "@/server/seed/demo";
import { seedId } from "@/server/seed/ids";

import { signIn } from "../support/auth";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { appRequest, STRONG_PASSWORD } from "../support/http";

const DEMO_PASSWORD = "maroon-lantern-bicycle-42";

describe("seed data and admin provisioning", () => {
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

  const tally = async () => {
    const tables = [
      schema.campuses,
      schema.campusLocations,
      schema.cuisines,
      schema.restaurants,
      schema.restaurantHours,
      schema.restaurantCuisines,
      schema.menuCategories,
      schema.menuItems,
      schema.menuOptionGroups,
      schema.menuOptions,
    ] as const;
    return Promise.all(tables.map(async (t) => (await db.select({ n: count() }).from(t))[0]!.n));
  };

  describe("catalog seed (docs/DATABASE_DESIGN.md §7)", () => {
    it("is idempotent: running it twice leaves the same rows", async () => {
      const first = await seedCatalog(db);
      const afterFirst = await tally();
      await seedCatalog(db);
      expect(await tally()).toEqual(afterFirst);
      expect(first).toEqual({ campuses: 1, locations: 13, cuisines: 9, restaurants: 6, menuItems: 21 });
    });

    it("flags every restaurant as sample data, with hours, cuisines, and menus", async () => {
      await seedCatalog(db);
      const restaurants = await db.select().from(schema.restaurants);
      expect(restaurants).toHaveLength(RESTAURANTS.length);
      for (const restaurant of restaurants) {
        expect(restaurant.isSampleData, restaurant.name).toBe(true);
        const hours = await db
          .select()
          .from(schema.restaurantHours)
          .where(eq(schema.restaurantHours.restaurantId, restaurant.id));
        expect(hours.length, `${restaurant.name} hours`).toBeGreaterThan(0);
        const items = await db
          .select()
          .from(schema.menuItems)
          .where(eq(schema.menuItems.restaurantId, restaurant.id));
        expect(items.length, `${restaurant.name} items`).toBeGreaterThan(0);
      }
      // One item is deliberately unavailable, to exercise that state in the demo.
      expect(
        await db.select().from(schema.menuItems).where(eq(schema.menuItems.isAvailable, false)),
      ).toHaveLength(1);
    });

    it("restores rows an admin changed back to the seed values", async () => {
      await seedCatalog(db);
      const id = seedId("item:smash-and-shake:double-smash");
      await db
        .update(schema.menuItems)
        .set({ priceCents: 1, deletedAt: new Date() })
        .where(eq(schema.menuItems.id, id));
      await seedCatalog(db);
      const [item] = await db.select().from(schema.menuItems).where(eq(schema.menuItems.id, id));
      expect(item).toMatchObject({ priceCents: 899, deletedAt: null });
    });
  });

  describe("demo accounts", () => {
    it("refuses to run in production or without a strong-enough password", async () => {
      await expect(
        seedDemoAccounts(db, { password: DEMO_PASSWORD, appEnv: "production" }),
      ).rejects.toBeInstanceOf(DemoSeedRefused);
      await expect(seedDemoAccounts(db, { password: undefined, appEnv: "development" })).rejects.toThrow(
        /SEED_DEMO_PASSWORD/,
      );
      await expect(seedDemoAccounts(db, { password: "short", appEnv: "test" })).rejects.toThrow(
        /at least 10/,
      );
      expect(await db.select().from(schema.users)).toHaveLength(0);
    });

    it("creates accounts that sign in through the real auth flow, with the right roles", async () => {
      await seedCatalog(db);
      await seedDemoAccounts(db, { password: DEMO_PASSWORD, appEnv: "test" });

      for (const account of DEMO_ACCOUNTS) {
        const { response } = await signIn(account.email, DEMO_PASSWORD);
        expect(response.status, account.email).toBe(200);
      }
      const couriers = await db
        .select({ email: schema.users.email, status: schema.courierProfiles.status })
        .from(schema.courierProfiles)
        .innerJoin(schema.users, eq(schema.users.id, schema.courierProfiles.userId))
        .orderBy(schema.users.email);
      expect(couriers).toEqual([
        { email: "applicant@demo.coogcrave.test", status: "PENDING" },
        { email: "courier@demo.coogcrave.test", status: "APPROVED" },
      ]);
      const [admin] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, "admin@demo.coogcrave.test"));
      expect(admin!.role).toBe("ADMIN");

      // The seeded admin can use admin endpoints.
      const { jar } = await signIn("admin@demo.coogcrave.test", DEMO_PASSWORD);
      expect((await auditGet(appRequest("/api/v1/admin/audit-events", { jar }))).status).toBe(200);
    });

    it("resets demo accounts on re-run without duplicating them or their audit records", async () => {
      await seedCatalog(db);
      await seedDemoAccounts(db, { password: DEMO_PASSWORD, appEnv: "test" });
      await db
        .update(schema.users)
        .set({ role: "ADMIN", suspendedAt: new Date() })
        .where(eq(schema.users.email, "customer@demo.coogcrave.test"));
      await seedDemoAccounts(db, { password: DEMO_PASSWORD, appEnv: "test" });

      expect(await db.select().from(schema.users)).toHaveLength(DEMO_ACCOUNTS.length);
      const [customer] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, "customer@demo.coogcrave.test"));
      expect(customer).toMatchObject({ role: "STUDENT", suspendedAt: null, emailVerified: true });
      const audits = await db
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.action, "user.create_admin"));
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorType: "SYSTEM",
        actorUserId: null,
        metadata: { via: "seed:demo" },
      });
    });
  });

  describe("pnpm admin:create (docs/ARCHITECTURE.md §8)", () => {
    it("creates a verified admin who can sign in, and records it in the audit log", async () => {
      const result = await createOrPromoteAdmin(db, {
        email: "Ada@UH.edu",
        name: "Ada Lovelace",
        password: STRONG_PASSWORD,
      });
      expect(result.outcome).toBe("created");
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, result.userId));
      expect(user).toMatchObject({ email: "ada@uh.edu", role: "ADMIN", emailVerified: true });
      expect((await signIn("ada@uh.edu", STRONG_PASSWORD)).response.status).toBe(200);
      const [audit] = await db.select().from(schema.auditEvents);
      expect(audit).toMatchObject({
        actorType: "SYSTEM",
        action: "user.create_admin",
        targetId: result.userId,
        metadata: { via: "cli:admin:create" },
      });
    });

    it("promotes an existing account without touching its password", async () => {
      await createOrPromoteAdmin(db, {
        email: "ada@uh.edu",
        name: "Ada Lovelace",
        password: STRONG_PASSWORD,
      });
      await db.update(schema.users).set({ role: "STUDENT" }).where(eq(schema.users.email, "ada@uh.edu"));
      const result = await createOrPromoteAdmin(db, {
        email: "ada@uh.edu",
        name: "Ignored",
        password: "ignored",
      });
      expect(result.outcome).toBe("promoted");
      expect((await signIn("ada@uh.edu", STRONG_PASSWORD)).response.status).toBe(200);
      const actions = (await db.select({ a: schema.auditEvents.action }).from(schema.auditEvents))
        .map((r) => r.a)
        .sort();
      expect(actions).toEqual(["user.create_admin", "user.promote_admin"]);
    });

    it("applies the password policy and rejects bad input, creating nothing", async () => {
      await expect(
        createOrPromoteAdmin(db, { email: "ada@uh.edu", name: "Ada Lovelace", password: "password1234" }),
      ).rejects.toThrow(/Password rejected/);
      await expect(
        createOrPromoteAdmin(db, { email: "not-an-email", name: "Ada", password: STRONG_PASSWORD }),
      ).rejects.toThrow();
      await expect(
        createOrPromoteAdmin(db, { email: "ada@uh.edu", name: "", password: STRONG_PASSWORD }),
      ).rejects.toThrow();
      expect(await db.select().from(schema.users)).toHaveLength(0);
      expect(await db.select().from(schema.auditEvents)).toHaveLength(0);
    });
  });
});
