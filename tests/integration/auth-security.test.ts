import { Writable } from "node:stream";

import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAuth } from "@/server/auth/auth";
import { parseConfig } from "@/server/config";
import * as schema from "@/server/db/schema";
import { createLogger } from "@/server/logger";
import type { MailMessage } from "@/server/mail/mailer";

import { auth, registerVerified, signedInUser, signIn, signUp } from "../support/auth";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import {
  appRequest,
  bodyOf,
  CookieJar,
  latestMailTo,
  linkIn,
  mailTo,
  OTHER_STRONG_PASSWORD,
  pathOf,
  STRONG_PASSWORD,
  uniqueEmail,
} from "../support/http";

describe("authentication security controls", () => {
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

  const userByEmail = async (email: string) =>
    (await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())))[0];

  describe("role and field injection (THREAT_MODEL T-02, PRD AUTH-6)", () => {
    it("ignores a client-supplied role at sign-up: the account is a STUDENT", async () => {
      const email = uniqueEmail();
      expect((await signUp(email, STRONG_PASSWORD, { role: "ADMIN" })).status).toBe(200);
      expect((await userByEmail(email))!.role).toBe("STUDENT");
    });

    it("refuses a client-supplied suspendedAt or emailVerified flag", async () => {
      const email = uniqueEmail();
      const response = await signUp(email, STRONG_PASSWORD, { suspendedAt: new Date().toISOString() });
      expect(response.status).toBe(400);
      expect(await userByEmail(email)).toBeUndefined();

      const other = uniqueEmail();
      await signUp(other, STRONG_PASSWORD, { emailVerified: true });
      expect((await userByEmail(other))!.emailVerified).toBe(false);
    });
  });

  describe("sign-up rules (PRD AUTH-1, AUTH-2)", () => {
    it("only accepts allowed email domains and their subdomains, never look-alikes", async () => {
      for (const email of [
        "alex@gmail.com",
        "alex@evil-uh.edu",
        "alex@uh.edu.attacker.example",
        "alex@uhedu.com",
      ]) {
        const response = await signUp(email);
        expect(response.status, email).toBe(400);
        expect((await bodyOf(response)).code).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
      }
      expect(await db.select().from(schema.users)).toHaveLength(0);
      expect((await signUp(`alex.${Date.now()}@uh.edu`)).status).toBe(200);
      expect((await signUp(uniqueEmail())).status).toBe(200); // @cougarnet.uh.edu
    });

    it("rejects short, common, and personal passwords with a helpful message", async () => {
      for (const password of ["short1!", "password1234", "1234567890ab", "alexrivera2026"]) {
        const response = await signUp(uniqueEmail(), password);
        expect(response.status, password).toBe(400);
        const body = await bodyOf<{ code: string; message: string }>(response);
        expect(["PASSWORD_TOO_WEAK", "PASSWORD_TOO_SHORT"]).toContain(body.code);
        expect(body.message.length).toBeGreaterThan(10);
      }
      expect(await db.select().from(schema.users)).toHaveLength(0);
    });

    it("requires a reasonable name without markup", async () => {
      for (const name of ["", "   ", "<script>x</script>", "a".repeat(101)]) {
        const response = await signUp(uniqueEmail(), STRONG_PASSWORD, { name });
        expect(response.status, JSON.stringify(name)).toBe(400);
        expect((await bodyOf(response)).code).toBe("INVALID_NAME");
      }
    });
  });

  describe("account enumeration (THREAT_MODEL T-15)", () => {
    it("answers sign-up for an existing email exactly like a new one, and tells the owner by email", async () => {
      const existing = uniqueEmail();
      await registerVerified(existing);

      const fresh = await signUp(uniqueEmail());
      const repeat = await signUp(existing, OTHER_STRONG_PASSWORD);
      expect(repeat.status).toBe(fresh.status);
      const freshBody = await bodyOf<{ token: null; user: Record<string, unknown> }>(fresh);
      const repeatBody = await bodyOf<{ token: null; user: Record<string, unknown> }>(repeat);
      expect(Object.keys(repeatBody).sort()).toEqual(Object.keys(freshBody).sort());
      expect(Object.keys(repeatBody.user).sort()).toEqual(Object.keys(freshBody.user).sort());
      expect(repeatBody.user.emailVerified).toBe(false);

      // Still one account, with the original password.
      expect(await db.select().from(schema.users).where(eq(schema.users.email, existing))).toHaveLength(1);
      expect((await signIn(existing, STRONG_PASSWORD)).response.status).toBe(200);
      expect((await latestMailTo(existing)).subject).toBe("Someone tried to sign up with your email");
    });

    it("gives the same answer for an unknown email and a wrong password", async () => {
      const email = uniqueEmail();
      await registerVerified(email);
      const wrongPassword = await signIn(email, OTHER_STRONG_PASSWORD);
      const unknownEmail = await signIn(uniqueEmail(), OTHER_STRONG_PASSWORD);
      expect(wrongPassword.response.status).toBe(401);
      expect(unknownEmail.response.status).toBe(401);
      expect(await bodyOf(wrongPassword.response)).toEqual(await bodyOf(unknownEmail.response));
    });

    it("answers password-reset requests identically whether or not the account exists", async () => {
      const email = uniqueEmail();
      await registerVerified(email);
      const known = await auth("/request-password-reset", { body: { email, redirectTo: "/reset-password" } });
      const unknown = await auth("/request-password-reset", {
        body: { email: uniqueEmail(), redirectTo: "/reset-password" },
      });
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await bodyOf(known)).toEqual(await bodyOf(unknown));
    });
  });

  describe("password reset (PRD AUTH-5, THREAT_MODEL T-17)", () => {
    async function requestReset(email: string): Promise<string> {
      await auth("/request-password-reset", { body: { email, redirectTo: "/reset-password" } });
      const mail = await latestMailTo(email);
      expect(mail.subject).toBe("Reset your CoogCrave password");
      // The emailed link validates the token, then redirects to our page with it.
      const callback = await auth(pathOf(linkIn(mail)));
      expect(callback.status).toBe(302);
      const location = new URL(callback.headers.get("location")!);
      expect(location.pathname).toBe("/reset-password");
      return location.searchParams.get("token")!;
    }

    it("resets with a strong password, signs out other sessions, and works only once", async () => {
      const email = uniqueEmail();
      const oldJar = await signedInUser(email);
      const token = await requestReset(email);

      // Stored hashed: the token itself isn't in the database.
      const stored = await db.execute(sql`select identifier from verifications`);
      expect(JSON.stringify(stored.rows)).not.toContain(token);

      const weak = await auth("/reset-password", { body: { token, newPassword: "password1234" } });
      expect(weak.status).toBe(400);
      expect((await bodyOf(weak)).code).toBe("PASSWORD_TOO_WEAK");

      const ok = await auth("/reset-password", { body: { token, newPassword: OTHER_STRONG_PASSWORD } });
      expect(ok.status).toBe(200);
      expect((await latestMailTo(email)).subject).toBe("Your CoogCrave password was changed");

      // Existing sessions were revoked; the old password no longer works; the new one does.
      expect(await bodyOf(await auth("/get-session", { jar: oldJar }))).toBeNull();
      expect((await signIn(email, STRONG_PASSWORD)).response.status).toBe(401);
      expect((await signIn(email, OTHER_STRONG_PASSWORD)).response.status).toBe(200);

      const reused = await auth("/reset-password", {
        body: { token, newPassword: "another-sturdy-phrase-77" },
      });
      expect(reused.status).toBe(400);
      expect((await bodyOf(reused)).code).toBe("INVALID_TOKEN");
    });

    it("rejects made-up tokens", async () => {
      const response = await auth("/reset-password", {
        body: { token: "not-a-real-token-123456", newPassword: OTHER_STRONG_PASSWORD },
      });
      expect(response.status).toBe(400);
    });
  });

  describe("suspended accounts (PRD AUTH-7)", () => {
    it("can't sign in, and a wrong password still gets the generic answer", async () => {
      const email = uniqueEmail();
      await registerVerified(email);
      await db.update(schema.users).set({ suspendedAt: new Date() }).where(eq(schema.users.email, email));

      const right = await signIn(email);
      expect(right.response.status).toBe(403);
      expect((await bodyOf(right.response)).code).toBe("ACCOUNT_SUSPENDED");
      expect(right.jar.has("coogcrave.session_token")).toBe(false);

      const wrong = await signIn(email, OTHER_STRONG_PASSWORD);
      expect(wrong.response.status).toBe(401);
    });
  });

  describe("open redirects (THREAT_MODEL T-18)", () => {
    it("refuses verification links that redirect off-site", async () => {
      const email = uniqueEmail();
      await signUp(email);
      const link = new URL(linkIn(await latestMailTo(email)));
      link.searchParams.set("callbackURL", "https://evil.example/phish");
      const response = await auth(pathOf(link.toString()));
      expect(response.status).toBe(403);
      expect((await userByEmail(email))!.emailVerified).toBe(false);
    });

    it("refuses password-reset requests that redirect off-site", async () => {
      const email = uniqueEmail();
      await registerVerified(email);
      const before = (await mailTo(email)).length;
      const response = await auth("/request-password-reset", {
        body: { email, redirectTo: "https://evil.example/reset" },
      });
      expect(response.status).toBe(403);
      expect((await mailTo(email)).length).toBe(before);
    });
  });

  describe("request hygiene (THREAT_MODEL T-20, T-24)", () => {
    it("rejects cross-origin and cross-site auth requests (login CSRF)", async () => {
      const email = uniqueEmail();
      await registerVerified(email);
      const foreign = await auth("/sign-in/email", {
        body: { email, password: STRONG_PASSWORD },
        headers: { origin: "https://evil.example" },
      });
      expect(foreign.status).toBe(403);
      expect((await bodyOf<{ error: { code: string } }>(foreign)).error.code).toBe("FORBIDDEN");

      const crossSite = await auth("/sign-out", { body: {}, headers: { "sec-fetch-site": "cross-site" } });
      expect(crossSite.status).toBe(403);
    });

    it("rejects form-encoded bodies, which cross-site forms can send without a preflight", async () => {
      const request = new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000" },
        body: "email=a%40uh.edu&password=x",
      });
      const response = await (await import("@/app/api/auth/[...all]/route")).POST(request);
      expect(response.status).toBe(415);
    });

    it("rejects oversized bodies before Better Auth parses them", async () => {
      const response = await signUp(uniqueEmail(), STRONG_PASSWORD, { padding: "x".repeat(20_000) });
      expect(response.status).toBe(413);
      expect(await db.select().from(schema.users)).toHaveLength(0);
    });

    it("tags responses with a request ID", async () => {
      const response = await auth("/get-session");
      expect(response.headers.get("x-request-id")).toMatch(/^req_[a-f0-9]{32}$/);
    });

    it("turns off Better Auth endpoints the app doesn't use", async () => {
      const jar = await signedInUser(uniqueEmail());
      for (const path of [
        "/update-user",
        "/list-sessions",
        "/revoke-other-sessions",
        "/delete-user",
        "/change-email",
      ]) {
        const response = await auth(path, {
          body: { name: "Mallory", image: "https://evil.example/x.png" },
          jar,
        });
        expect(response.status, path).toBe(404);
      }
    });
  });

  describe("rate limits (THREAT_MODEL T-14)", () => {
    it("throttles repeated sign-in attempts against one email, from any IP", async () => {
      const email = uniqueEmail();
      await registerVerified(email);
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        // A different IP each time: the per-email limit still applies.
        const { response } = await signIn(email, OTHER_STRONG_PASSWORD, { ip: `203.0.113.${i + 1}` });
        statuses.push(response.status);
        if (response.status === 429) {
          expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
          expect((await bodyOf<{ error: { code: string } }>(response)).error.code).toBe("RATE_LIMITED");
        }
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
      // The counters table holds hashes, never the email itself.
      const keys = await db.execute(sql`select key from rate_limit_buckets`);
      expect(JSON.stringify(keys.rows)).not.toContain(email);
    });

    it("throttles sign-ups from one IP", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++)
        statuses.push((await signUp(uniqueEmail(), STRONG_PASSWORD, {}, { ip: "192.0.2.50" })).status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(20);
      expect(statuses[20]).toBe(429);
      // Another IP is unaffected.
      expect((await signUp(uniqueEmail(), STRONG_PASSWORD, {}, { ip: "192.0.2.51" })).status).toBe(200);
    });

    it("caps 'someone tried to sign up' notices to an existing owner, from any IP", async () => {
      const email = uniqueEmail();
      await registerVerified(email);
      const before = (await mailTo(email)).length;
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await signUp(email, OTHER_STRONG_PASSWORD, {}, { ip: `192.0.2.${100 + i}` })).status);
      }
      // The first counted attempt was the original sign-up, so 4 more succeed before the cap.
      expect(statuses).toEqual([200, 200, 200, 200, 429, 429]);
      expect((await mailTo(email)).length).toBe(before + 4);
    });

    it("limits password-reset emails per address", async () => {
      const email = uniqueEmail();
      await registerVerified(email);
      const before = (await mailTo(email)).length;
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        statuses.push(
          (
            await auth("/request-password-reset", {
              body: { email, redirectTo: "/reset-password" },
              ip: `198.51.100.${i + 20}`,
            })
          ).status,
        );
      }
      expect(statuses).toEqual([200, 200, 200, 429]);
      expect((await mailTo(email)).length).toBe(before + 3);
    });
  });

  describe("logging (THREAT_MODEL T-27)", () => {
    it("keeps email addresses out of Better Auth's log messages", async () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          lines.push(chunk.toString());
          callback();
        },
      });
      const sent: MailMessage[] = [];
      const instance = createAuth({
        db: (await import("@/server/db/client")).getDb(),
        config: parseConfig(process.env),
        mailer: { send: async (m) => void sent.push(m) },
        logger: createLogger({ level: "info" }, stream),
      });
      const email = uniqueEmail("logcheck");
      const body = { name: "Log Check", email, password: STRONG_PASSWORD };
      const call = () => instance.handler(appRequest("/api/auth/sign-up/email", { body }));
      expect((await call()).status).toBe(200);
      expect((await call()).status).toBe(200); // duplicate: Better Auth logs the attempt

      const output = lines.join("");
      expect(output).toContain("Sign-up attempt for existing email: [email]");
      expect(output).not.toContain(email);
      expect(sent.map((m) => m.subject)).toEqual([
        "Verify your CoogCrave email",
        "Someone tried to sign up with your email",
      ]);
    });
  });

  it("CookieJar sanity: a fresh jar has no session", () => {
    expect(new CookieJar().header()).toBe("");
  });
});
