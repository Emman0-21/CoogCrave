import { expect } from "vitest";

import { GET, POST } from "@/app/api/auth/[...all]/route";

import { appRequest, CookieJar, latestMailTo, linkIn, pathOf, STRONG_PASSWORD } from "./http";

/**
 * Sends a request through the real /api/auth route (wrapper + Better Auth + Postgres).
 * Accepts a path below /api/auth ("/sign-in/email") or a full app path from an email link.
 */
export function auth(pathname: string, options: Parameters<typeof appRequest>[1] = {}): Promise<Response> {
  const request = appRequest(pathname.startsWith("/api/auth") ? pathname : `/api/auth${pathname}`, options);
  return request.method === "GET" ? GET(request) : POST(request);
}

export function signUp(
  email: string,
  password = STRONG_PASSWORD,
  extra: Record<string, unknown> = {},
  options: { ip?: string } = {},
) {
  return auth("/sign-up/email", {
    body: { name: "Alex Rivera", email, password, callbackURL: "/sign-in?verified=1", ...extra },
    ip: options.ip,
  });
}

/** Registers and verifies an account through the real email link. */
export async function registerVerified(email: string, password = STRONG_PASSWORD): Promise<void> {
  expect((await signUp(email, password)).status).toBe(200);
  const verify = await auth(pathOf(linkIn(await latestMailTo(email))));
  expect(verify.status).toBe(302);
}

export async function signIn(
  email: string,
  password = STRONG_PASSWORD,
  options: { jar?: CookieJar; ip?: string } = {},
) {
  const jar = options.jar ?? new CookieJar();
  const response = await auth("/sign-in/email", { body: { email, password }, jar, ip: options.ip });
  jar.absorb(response);
  return { response, jar };
}

/** A verified, signed-in account and its cookie jar. */
export async function signedInUser(email: string, password = STRONG_PASSWORD): Promise<CookieJar> {
  await registerVerified(email, password);
  const { response, jar } = await signIn(email, password);
  expect(response.status).toBe(200);
  return jar;
}
