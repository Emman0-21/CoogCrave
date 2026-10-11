import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as auditGet } from "@/app/api/v1/admin/audit-events/route";
import { GET as locationsGet } from "@/app/api/v1/locations/route";
import { GET as meGet, PATCH as mePatch } from "@/app/api/v1/me/route";
import * as schema from "@/server/db/schema";
import { recordAudit } from "@/server/services/audit";

import { signedInUser } from "../support/auth";
import { openPool, resetDatabase } from "../support/db";
import { createCampus, createLocation, testDb, type TestDb } from "../support/fixtures";
import { appRequest, bodyOf, type CookieJar, uniqueEmail } from "../support/http";

describe("profile and locations (PRD AUTH-8)", () => {
  let pool: Pool;
  let db: TestDb;
  let jar: CookieJar;
  let email: string;
  let dropPoints: { library: string; hidden: string; pickupOnly: string };

  beforeAll(() => {
    pool = openPool("app");
    db = testDb(pool);
  });
  beforeEach(async () => {
    await resetDatabase();
    const campus = await createCampus(db);
    const library = await createLocation(db, campus.id, {
      name: "MD Anderson Library",
      shortName: "Library",
      sortOrder: 2,
    });
    await createLocation(db, campus.id, { name: "Agnes Arnold Hall", shortName: "AAH", sortOrder: 1 });
    const hidden = await createLocation(db, campus.id, {
      name: "Old Annex",
      shortName: "Annex",
      deletedAt: new Date(),
    });
    const pickupOnly = await createLocation(db, campus.id, {
      name: "Kitchen Dock",
      shortName: "Dock",
      isDropPoint: false,
    });
    dropPoints = { library: library.id, hidden: hidden.id, pickupOnly: pickupOnly.id };
    email = uniqueEmail();
    jar = await signedInUser(email);
  });
  afterAll(async () => {
    await pool.end();
  });

  const patch = (body: unknown) => mePatch(appRequest("/api/v1/me", { method: "PATCH", body, jar }));

  it("lists only active drop points, in display order", async () => {
    const response = await locationsGet(appRequest("/api/v1/locations"));
    const { data } = await bodyOf<{ data: { name: string }[] }>(response);
    expect(data.map((l) => l.name)).toEqual(["Agnes Arnold Hall", "MD Anderson Library"]);
  });

  it("returns the signed-in user's own account and nothing sensitive", async () => {
    const response = await meGet(appRequest("/api/v1/me", { jar }));
    expect(response.status).toBe(200);
    const me = await bodyOf<Record<string, unknown>>(response);
    expect(me).toMatchObject({
      email,
      name: "Alex Rivera",
      role: "STUDENT",
      emailVerified: true,
      profile: { displayName: null, defaultLocationId: null },
      courier: null,
      unreadNotifications: 0,
    });
    expect(Object.keys(me).sort()).toEqual(
      ["courier", "email", "emailVerified", "id", "name", "profile", "role", "unreadNotifications"].sort(),
    );
    expect(JSON.stringify(me)).not.toMatch(/password|token|session|suspended/i);
  });

  it("saves, changes, and clears the display name and default drop point", async () => {
    const first = await patch({ displayName: "  Alex R.  ", defaultLocationId: dropPoints.library });
    expect(first.status).toBe(200);
    expect((await bodyOf<{ profile: object }>(first)).profile).toEqual({
      displayName: "Alex R.",
      defaultLocationId: dropPoints.library,
    });

    // Partial update keeps the other field.
    const second = await patch({ displayName: "AR" });
    expect((await bodyOf<{ profile: object }>(second)).profile).toEqual({
      displayName: "AR",
      defaultLocationId: dropPoints.library,
    });

    const cleared = await patch({ displayName: null, defaultLocationId: null });
    expect((await bodyOf<{ profile: object }>(cleared)).profile).toEqual({
      displayName: null,
      defaultLocationId: null,
    });
    expect(await db.select().from(schema.userProfiles)).toHaveLength(1);
  });

  it("only accepts active drop points as the default location", async () => {
    for (const id of [dropPoints.hidden, dropPoints.pickupOnly, crypto.randomUUID()]) {
      const response = await patch({ defaultLocationId: id });
      expect(response.status).toBe(422);
      expect((await bodyOf<{ error: { code: string } }>(response)).error.code).toBe("INVALID_LOCATION");
    }
    expect((await patch({ defaultLocationId: "not-a-uuid" })).status).toBe(400);
  });

  it("validates display names", async () => {
    for (const displayName of ["", "   ", "x".repeat(61), "<img src=x>", "tab\there"]) {
      expect((await patch({ displayName })).status, JSON.stringify(displayName)).toBe(400);
    }
    expect((await patch({})).status).toBe(400);
  });

  it("only ever changes the caller's own profile", async () => {
    const otherEmail = uniqueEmail("other");
    const otherJar = await signedInUser(otherEmail);
    await mePatch(
      appRequest("/api/v1/me", { method: "PATCH", body: { displayName: "Other" }, jar: otherJar }),
    );
    await patch({ displayName: "Mine" });
    const [other] = await db
      .select({ displayName: schema.userProfiles.displayName })
      .from(schema.userProfiles)
      .innerJoin(schema.users, eq(schema.users.id, schema.userProfiles.userId))
      .where(eq(schema.users.email, otherEmail));
    expect(other!.displayName).toBe("Other");
  });

  it("counts unread notifications", async () => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    await db.insert(schema.notifications).values([
      { userId: user!.id, type: "ORDER_PLACED", title: "Placed", body: "Your order was placed." },
      {
        userId: user!.id,
        type: "ORDER_CONFIRMED",
        title: "Confirmed",
        body: "Confirmed.",
        readAt: new Date(),
      },
    ]);
    const me = await bodyOf<{ unreadNotifications: number }>(await meGet(appRequest("/api/v1/me", { jar })));
    expect(me.unreadNotifications).toBe(1);
  });
});

describe("audit log API (PRD ADM-9)", () => {
  let pool: Pool;
  let db: TestDb;
  let adminJar: CookieJar;
  let adminId: string;

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    const email = uniqueEmail("admin");
    adminJar = await signedInUser(email);
    const [admin] = await db
      .update(schema.users)
      .set({ role: "ADMIN" })
      .where(eq(schema.users.email, email))
      .returning();
    adminId = admin!.id;
  });
  afterAll(async () => {
    await pool.end();
  });

  const list = (query = "") => auditGet(appRequest(`/api/v1/admin/audit-events${query}`, { jar: adminJar }));

  it("pages through events newest first without skipping rows that share a timestamp", async () => {
    // 7 events inside the same millisecond (Postgres keeps microseconds, JS Dates don't), 4 of them at
    // the identical microsecond, plus 3 older ones: the hard cases for keyset pagination.
    const sameInstant = new Date("2026-10-01T12:00:00.123Z");
    const micros = ["123456", "123456", "123456", "123456", "123789", "123001", "123500"];
    for (const [i, us] of micros.entries()) {
      await db.insert(schema.auditEvents).values({
        actorType: "SYSTEM",
        action: "test.same_instant",
        targetType: "test",
        targetId: `same-${i}`,
        createdAt: sql`${`2026-10-01T12:00:00.${us}Z`}::timestamptz` as unknown as Date,
      });
    }
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.auditEvents).values({
        actorType: "SYSTEM",
        action: "test.older",
        targetType: "test",
        targetId: `older-${i}`,
        createdAt: new Date(sameInstant.getTime() - (i + 1) * 60_000),
      });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response = await list(`?targetType=test&limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      expect(response.status).toBe(200);
      const page: { data: { targetId: string; createdAt: string }[]; nextCursor: string | null } =
        await bodyOf(response);
      seen.push(...page.data.map((e) => e.targetId));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBe(4);
    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
    expect(seen.slice(7)).toEqual(["older-0", "older-1", "older-2"]);
  });

  it("records admin actions with the actor and request ID, and shows who did them", async () => {
    await recordAudit(db, {
      by: {
        kind: "ADMIN",
        actor: {
          userId: adminId,
          name: "A",
          email: "a",
          role: "ADMIN",
          emailVerified: true,
          suspended: false,
          courier: null,
        },
      },
      action: "courier.approve",
      targetType: "courier",
      targetId: "c-1",
      metadata: { note: "Looks good" },
      requestId: "req_test12345",
    });
    await recordAudit(db, {
      by: { kind: "SYSTEM", label: "cli:admin:create" },
      action: "user.create_admin",
      targetType: "user",
      targetId: "u-1",
    });

    const { data } = await bodyOf<{ data: Record<string, unknown>[] }>(await list("?targetType=courier"));
    expect(data[0]).toMatchObject({
      actorType: "ADMIN",
      actor: { id: adminId },
      action: "courier.approve",
      metadata: { note: "Looks good" },
      requestId: "req_test12345",
    });
    const system = await bodyOf<{ data: Record<string, unknown>[] }>(await list("?targetType=user"));
    expect(system.data[0]).toMatchObject({
      actorType: "SYSTEM",
      actor: null,
      metadata: { via: "cli:admin:create" },
    });
  });

  it("rejects malformed cursors and out-of-range limits", async () => {
    expect((await list("?cursor=garbage")).status).toBe(400);
    expect((await list(`?cursor=${Buffer.from("2026-01-01|x").toString("base64url")}`)).status).toBe(400);
    expect((await list("?limit=500")).status).toBe(400);
    expect((await list("?unknown=1")).status).toBe(400);
  });
});
