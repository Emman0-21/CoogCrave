import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as healthGet } from "@/app/api/health/route";
import { GET as auditGet } from "@/app/api/v1/admin/audit-events/route";
import { GET as locationsGet } from "@/app/api/v1/locations/route";
import { GET as meGet, PATCH as mePatch } from "@/app/api/v1/me/route";
import * as schema from "@/server/db/schema";

import { signedInUser } from "../support/auth";
import { openPool, resetDatabase } from "../support/db";
import { createCampus, createCourier, createLocation, testDb, type TestDb } from "../support/fixtures";
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

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    const campus = await createCampus(db);
    await createLocation(db, campus.id);

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
  ] as const;

  const U = 401;
  const F = 403;
  // Expected status for each endpoint × identity.
  const expected: Record<(typeof endpoints)[number]["name"], Record<Identity, number>> = {
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
