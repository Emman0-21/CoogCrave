import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";

import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { auth, signIn, signUp } from "../support/auth";
import { bodyOf, latestMailTo, linkIn, mailTo, pathOf, STRONG_PASSWORD, uniqueEmail } from "../support/http";

describe("account lifecycle through /api/auth (PRD AUTH-1, AUTH-3, AUTH-4)", () => {
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

  it("registers, requires email verification, signs in with a secure cookie, and signs out", async () => {
    const email = uniqueEmail();

    // 1. Sign up: account created, no session yet, verification email sent.
    const signUpResponse = await signUp(email);
    expect(signUpResponse.status).toBe(200);
    expect(signUpResponse.headers.getSetCookie()).toEqual([]);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    expect(user).toMatchObject({ emailVerified: false, role: "STUDENT" });
    const verificationMail = await latestMailTo(email);
    expect(verificationMail.subject).toBe("Verify your CoogCrave email");

    // 2. Signing in before verifying is refused (after the password check) and re-sends the link.
    const early = await signIn(email);
    expect(early.response.status).toBe(403);
    expect((await bodyOf(early.response)).code).toBe("EMAIL_NOT_VERIFIED");
    expect(early.jar.has("coogcrave.session_token")).toBe(false);
    expect((await mailTo(email)).length).toBe(2);

    // 3. The emailed link verifies the address and redirects to the sign-in page.
    const verify = await auth(pathOf(linkIn(verificationMail)));
    expect(verify.status).toBe(302);
    expect(verify.headers.get("location")).toBe("/sign-in?verified=1");
    const [verified] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    expect(verified!.emailVerified).toBe(true);
    // Verifying doesn't sign anyone in: a link opened by an email scanner gets no session.
    expect(verify.headers.getSetCookie().some((c) => c.startsWith("coogcrave.session_token"))).toBe(false);

    // 4. Sign in: httpOnly, SameSite=Lax session cookie (Secure is added when APP_URL is https).
    const { response, jar } = await signIn(email);
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith("coogcrave.session_token="));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=604800/);

    // 5. The session is recognized.
    const session = await bodyOf<{ user: { email: string } } | null>(await auth("/get-session", { jar }));
    expect(session?.user.email).toBe(email);

    // 6. Sign out ends it server-side.
    const out = await auth("/sign-out", { body: {}, jar });
    expect(out.status).toBe(200);
    const sessionsLeft = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, user!.id));
    expect(sessionsLeft).toHaveLength(0);
    jar.absorb(out);
    expect(await bodyOf(await auth("/get-session", { jar }))).toBeNull();
  });

  it("stores passwords only as hashes", async () => {
    const email = uniqueEmail();
    await signUp(email);
    const [account] = await db
      .select({ password: schema.accounts.password, providerId: schema.accounts.providerId })
      .from(schema.accounts)
      .innerJoin(schema.users, eq(schema.users.id, schema.accounts.userId))
      .where(eq(schema.users.email, email));
    expect(account!.providerId).toBe("credential");
    expect(account!.password).not.toContain(STRONG_PASSWORD);
    expect(account!.password!.length).toBeGreaterThan(60);
  });

  it("lowercases emails so one inbox maps to one account", async () => {
    const email = uniqueEmail("Mixed.Case");
    await signUp(email);
    const rows = await db.select({ email: schema.users.email }).from(schema.users);
    expect(rows).toEqual([{ email: email.toLowerCase() }]);
  });
});
