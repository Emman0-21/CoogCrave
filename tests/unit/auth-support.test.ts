import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkPassword, isBuiltFromPersonalWords, PASSWORD_MAX_LENGTH } from "@/server/auth/password-policy";
import { AUTH_RATE_RULES, authRateChecks, loggablePath } from "@/server/auth/rate-limits";
import { clientIp } from "@/server/http/client-ip";
import { scrubPersonalData } from "@/server/logger";
import { FileOutboxMailer, type StoredMail } from "@/server/mail/mailer";
import {
  existingAccountEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
} from "@/server/mail/templates";
import { rateLimitKey } from "@/server/rate-limit/rate-limiter";

describe("password policy (PRD AUTH-1)", () => {
  it.each([
    "violet-harbor-cactus-91",
    "correct horse battery staple",
    "tq7#Lm2vRb!x",
    "Houston-Cougars-Rule-2026",
  ])("accepts %s", (password) => {
    expect(checkPassword(password)).toEqual({ ok: true });
  });

  it.each([
    ["short", "Use at least 10 characters."],
    ["password1234", /too easy to guess/],
    ["1234567890", /too easy to guess/],
    ["qwertyuiop12", /too easy to guess/],
    ["Spring2027!", /too easy to guess/],
    ["coogcrave2026!", /too easy to guess/],
  ])("rejects %s", (password, message) => {
    const result = checkPassword(password);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
  });

  it("rejects passwords built from the person's own name or email, in any order or decoration", () => {
    const person = ["Alex Rivera", "alex.rivera@cougarnet.uh.edu"];
    for (const password of [
      "alexrivera2026",
      "AlexRivera2026!",
      "alex-rivera-2026",
      "Alex.Rivera.07",
      "rivera_alex_2026",
      "riveraalex2026",
      "Rivera!Rivera!Alex",
    ]) {
      const result = checkPassword(password, person);
      expect(result.ok, password).toBe(false);
    }
    expect(checkPassword("Alex.Rivera.07", person)).toEqual({
      ok: false,
      message: "Don't build your password from your name or email address.",
    });
    // The same passwords are fine for someone with a different name, and real passphrases still pass.
    expect(checkPassword("alex-rivera-2026", ["Jordan Lee"]).ok).toBe(true);
    expect(checkPassword("violet-harbor-cactus-91", person).ok).toBe(true);
  });

  it("only flags passwords made entirely of personal words", () => {
    expect(isBuiltFromPersonalWords("alex-rivera-2026", ["Alex Rivera"])).toBe(true);
    expect(isBuiltFromPersonalWords("alex-harbor-2026", ["Alex Rivera"])).toBe(false);
    expect(isBuiltFromPersonalWords("2026-2027", ["Alex Rivera"])).toBe(false);
    expect(isBuiltFromPersonalWords("anything", [])).toBe(false);
  });

  it("caps length to bound hashing cost", () => {
    const result = checkPassword("x".repeat(PASSWORD_MAX_LENGTH + 1));
    expect(result).toEqual({ ok: false, message: `Use at most ${PASSWORD_MAX_LENGTH} characters.` });
  });
});

describe("auth rate-limit rules", () => {
  const ip = "203.0.113.9";

  it("limits sign-in by IP and by email", () => {
    expect(authRateChecks("POST", "/sign-in/email", { email: "a@uh.edu" }, ip)).toEqual([
      { rule: AUTH_RATE_RULES.signInIp, subject: ip },
      { rule: AUTH_RATE_RULES.signInEmail, subject: "a@uh.edu" },
    ]);
  });

  it("limits sign-ups by IP and by email, so an owner can't be flooded with notices", () => {
    expect(
      authRateChecks("POST", "/sign-up/email", { email: "a@uh.edu" }, ip).map((c) => c.rule.name),
    ).toEqual(["auth.sign_up.ip", "auth.sign_up.email"]);
  });

  it("limits reset and verification emails per address", () => {
    expect(
      authRateChecks("POST", "/request-password-reset", { email: "a@uh.edu" }, ip).map((c) => c.rule.name),
    ).toEqual(["auth.reset_request.ip", "auth.reset_request.email"]);
    expect(
      authRateChecks("POST", "/send-verification-email", { email: "a@uh.edu" }, ip).map((c) => c.rule.name),
    ).toEqual(["auth.verify_resend.ip", "auth.verify_resend.email"]);
  });

  it("skips per-email limits when no email was sent, and falls back to a general per-IP limit", () => {
    expect(authRateChecks("POST", "/sign-in/email", {}, ip)).toEqual([
      { rule: AUTH_RATE_RULES.signInIp, subject: ip },
    ]);
    expect(authRateChecks("GET", "/get-session", {}, ip)).toEqual([
      { rule: AUTH_RATE_RULES.otherIp, subject: ip },
    ]);
    expect(authRateChecks("POST", "/sign-out", null, ip)).toEqual([
      { rule: AUTH_RATE_RULES.otherIp, subject: ip },
    ]);
  });

  it("keeps one-time tokens out of logged paths", () => {
    expect(loggablePath("/api/auth/reset-password/AbC123xyz")).toBe("/api/auth/reset-password/:token");
    expect(loggablePath("/api/auth/sign-in/email")).toBe("/api/auth/sign-in/email");
  });

  it("hashes rate-limit subjects so emails and IPs aren't stored", () => {
    const key = rateLimitKey(AUTH_RATE_RULES.signInEmail, "Alex@UH.edu");
    expect(key).toMatch(/^auth\.sign_in\.email:[a-f0-9]{32}$/);
    expect(key).not.toContain("alex");
    expect(rateLimitKey(AUTH_RATE_RULES.signInEmail, "alex@uh.edu ")).toBe(key);
  });
});

describe("clientIp", () => {
  it("uses the first X-Forwarded-For address, then X-Real-IP, then a shared bucket", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }))).toBe("203.0.113.1");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.2" }))).toBe("203.0.113.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("scrubPersonalData (THREAT_MODEL T-27)", () => {
  it("removes email addresses from free-text log messages", () => {
    expect(scrubPersonalData("Sign-up attempt for existing email: alex.r+1@cougarnet.uh.edu")).toBe(
      "Sign-up attempt for existing email: [email]",
    );
    expect(scrubPersonalData("users <a@uh.edu>, (b@x.io)")).toBe("users <[email]>, ([email])");
    expect(scrubPersonalData("no personal data here")).toBe("no personal data here");
  });
});

describe("account emails", () => {
  it("are plain text, addressed by first name, and explain what to do if unexpected", () => {
    const messages = [
      verificationEmail("a@uh.edu", "Alex Rivera", "http://x/verify"),
      passwordResetEmail("a@uh.edu", "Alex Rivera", "http://x/reset"),
      existingAccountEmail("a@uh.edu", "Alex Rivera", "http://x/sign-in", "http://x/forgot"),
      passwordChangedEmail("a@uh.edu", "Alex Rivera", "http://x/forgot"),
    ];
    for (const message of messages) {
      expect(message.to).toBe("a@uh.edu");
      expect(message.text).toMatch(/^Hi Alex,/);
      expect(message.text).toMatch(/http:\/\/x\//);
      expect(message.text).not.toMatch(/<[a-z]/i);
    }
    expect(verificationEmail("a@uh.edu", "  ", "u").text).toMatch(/^Hi there,/);
  });
});

describe("FileOutboxMailer", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes each message as a private JSON file, leaving no temp files", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "coogcrave-mail-"));
    const outbox = path.join(dir, "nested", "outbox");
    const mailer = new FileOutboxMailer(outbox, "CoogCrave <no-reply@coogcrave.test>");
    await mailer.send({ to: "a@uh.edu", subject: "Hello", text: "Body" });
    await mailer.send({ to: "b@uh.edu", subject: "Second", text: "Body 2" });

    const files = (await readdir(outbox)).sort();
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith(".json"))).toBe(true);
    const first = JSON.parse(await readFile(path.join(outbox, files[0]!), "utf8")) as StoredMail;
    expect(first).toMatchObject({
      to: "a@uh.edu",
      subject: "Hello",
      text: "Body",
      from: "CoogCrave <no-reply@coogcrave.test>",
    });
    expect((await stat(path.join(outbox, files[0]!))).mode & 0o777).toBe(0o600);
  });
});
