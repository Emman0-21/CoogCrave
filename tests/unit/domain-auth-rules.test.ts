import { describe, expect, it } from "vitest";

import type { Actor } from "@/server/domain/actor";
import { emailDomain, isAllowedEmailDomain, normalizeEmail } from "@/server/domain/email";
import { ACCESS_LEVELS, type AccessLevel, checkAccess } from "@/server/domain/policies";
import { safeNextPath } from "@/server/domain/safe-redirect";
import { COURIER_STATUSES, USER_ROLES } from "@/shared/enums";

describe("email domain allowlist (PRD AUTH-2)", () => {
  const allowed = ["uh.edu"];

  it.each([
    ["alex@uh.edu", true],
    ["alex@cougarnet.uh.edu", true],
    ["Alex@CougarNet.UH.EDU", true],
    ["alex@evil-uh.edu", false],
    ["alex@uh.edu.attacker.example", false],
    ["alex@uhedu.com", false],
    ["alex@edu", false],
    ["alex@", false],
    ["@uh.edu", false],
    ["no-at-sign", false],
    ["alex@uh.edu@gmail.com", false],
  ])("%s → %s", (email, expected) => {
    expect(isAllowedEmailDomain(email, allowed)).toBe(expected);
  });

  it("supports several allowed domains", () => {
    expect(isAllowedEmailDomain("judge@coogcrave.test", ["uh.edu", "coogcrave.test"])).toBe(true);
  });

  it("normalizes and extracts domains", () => {
    expect(normalizeEmail("  Alex@UH.edu ")).toBe("alex@uh.edu");
    expect(emailDomain("a@b@Cougarnet.UH.edu")).toBe("cougarnet.uh.edu");
    expect(emailDomain("nobody")).toBeNull();
  });
});

describe("checkAccess: every access level × actor state (THREAT_MODEL T-03)", () => {
  const base: Actor = {
    userId: "u1",
    name: "Alex Rivera",
    email: "alex@uh.edu",
    role: "STUDENT",
    emailVerified: true,
    suspended: false,
    courier: null,
  };

  it("allows anyone, signed in or not, on public routes", () => {
    expect(checkAccess("public", null)).toEqual({ allowed: true });
    expect(checkAccess("public", { ...base, suspended: true })).toEqual({ allowed: true });
  });

  it("requires a session for every other level", () => {
    for (const level of ACCESS_LEVELS.filter((l) => l !== "public")) {
      expect(checkAccess(level, null)).toEqual({ allowed: false, reason: "UNAUTHENTICATED" });
    }
  });

  it("reports suspension before anything else, then unverified email", () => {
    for (const level of ["user", "courier", "admin"] as const) {
      expect(checkAccess(level, { ...base, role: "ADMIN", suspended: true, emailVerified: false })).toEqual({
        allowed: false,
        reason: "ACCOUNT_SUSPENDED",
      });
      expect(checkAccess(level, { ...base, role: "ADMIN", emailVerified: false })).toEqual({
        allowed: false,
        reason: "EMAIL_NOT_VERIFIED",
      });
    }
  });

  // Exhaustive matrix over role × courier status for verified, active accounts.
  const courierStates = [null, ...COURIER_STATUSES] as const;
  for (const role of USER_ROLES) {
    for (const courier of courierStates) {
      const actor: Actor = {
        ...base,
        role,
        courier: courier ? { id: "c1", status: courier, isOnline: courier === "APPROVED" } : null,
      };
      const expected: Record<AccessLevel, string> = {
        public: "allowed",
        user: "allowed",
        courier: courier === "APPROVED" ? "allowed" : "COURIER_NOT_APPROVED",
        admin: role === "ADMIN" ? "allowed" : "FORBIDDEN",
      };
      it(`role=${role}, courier=${courier ?? "none"}`, () => {
        for (const level of ACCESS_LEVELS) {
          const decision = checkAccess(level, actor);
          expect(decision.allowed ? "allowed" : decision.reason, level).toBe(expected[level]);
        }
      });
    }
  }

  it("never grants admin access through courier approval", () => {
    expect(
      checkAccess("admin", { ...base, courier: { id: "c", status: "APPROVED", isOnline: true } }),
    ).toEqual({
      allowed: false,
      reason: "FORBIDDEN",
    });
  });
});

describe("safeNextPath (THREAT_MODEL T-18)", () => {
  it.each([
    ["/profile", "/profile"],
    ["/restaurants?cuisine=tacos#menu", "/restaurants?cuisine=tacos#menu"],
    ["/a/../profile", "/profile"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/profile",
    "//evil.example/profile",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "profile",
    "/pro\nfile",
    "/x\u0000y",
    "",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(safeNextPath(input, "/fallback")).toBe("/fallback");
  });

  it("falls back for null and undefined", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined, "/home")).toBe("/home");
  });
});
