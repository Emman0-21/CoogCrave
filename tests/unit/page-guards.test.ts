import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/domain/actor";

// Next.js redirect()/notFound() throw to stop rendering; the mocks do the same so control flow matches.
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
const session = vi.hoisted(() => ({ actor: null as Actor | null }));

vi.mock("next/navigation", () => navigation);
vi.mock("@/server/auth/session", () => ({ getCurrentActor: async () => session.actor }));

const { firstName, redirectIfSignedIn, requirePageAccess } = await import("@/server/auth/page-guards");

const student: Actor = {
  userId: "u1",
  name: "  Alex   Rivera ",
  email: "alex@uh.edu",
  role: "STUDENT",
  emailVerified: true,
  suspended: false,
  courier: null,
};

describe("page guards (protected routes)", () => {
  beforeEach(() => {
    session.actor = null;
    navigation.redirect.mockClear();
    navigation.notFound.mockClear();
  });

  it("sends signed-out visitors to sign-in with a safe return path", async () => {
    await expect(requirePageAccess("user", "/profile?tab=delivery")).rejects.toThrow(
      "REDIRECT /sign-in?next=%2Fprofile%3Ftab%3Ddelivery",
    );
    // A hostile path never becomes the return target.
    await expect(requirePageAccess("user", "//evil.example")).rejects.toThrow("REDIRECT /sign-in?next=%2F");
  });

  it("treats an unverified email like a missing session", async () => {
    session.actor = { ...student, emailVerified: false };
    await expect(requirePageAccess("user", "/profile")).rejects.toThrow("REDIRECT /sign-in?next=%2Fprofile");
  });

  it("explains suspension on the sign-in page", async () => {
    session.actor = { ...student, suspended: true };
    await expect(requirePageAccess("user", "/profile")).rejects.toThrow("REDIRECT /sign-in?suspended=1");
  });

  it("hides admin and courier pages from accounts without the capability (404)", async () => {
    session.actor = student;
    await expect(requirePageAccess("admin", "/admin")).rejects.toThrow("NOT_FOUND");
    await expect(requirePageAccess("courier", "/courier")).rejects.toThrow("NOT_FOUND");
  });

  it("returns the actor when access is allowed", async () => {
    session.actor = { ...student, role: "ADMIN" };
    await expect(requirePageAccess("admin", "/admin")).resolves.toMatchObject({ userId: "u1" });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("moves active signed-in users off the sign-in page, but not suspended ones", async () => {
    session.actor = student;
    await expect(redirectIfSignedIn("/profile")).rejects.toThrow("REDIRECT /profile");
    session.actor = { ...student, suspended: true };
    await expect(redirectIfSignedIn("/profile")).resolves.toBeUndefined();
    session.actor = null;
    await expect(redirectIfSignedIn("/profile")).resolves.toBeUndefined();
  });

  it("derives a first name for the header", () => {
    expect(firstName(student)).toBe("Alex");
  });
});
