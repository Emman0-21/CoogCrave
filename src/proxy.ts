import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { buildPageCsp, generateNonce } from "@/server/security/headers";

/** Page areas that need an account. */
const SIGNED_IN_AREAS = ["/profile", "/admin", "/courier", "/cart", "/checkout", "/orders", "/notifications"];

/**
 * Runs before page requests: sets the per-request CSP nonce, and sends visitors with no session cookie
 * straight to sign-in for account-only areas.
 *
 * This is NOT a security boundary (docs/ARCHITECTURE.md §8). It only checks that a cookie exists, not
 * that it's valid; every page and API route checks the session and role again on the server.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const needsAccount = SIGNED_IN_AREAS.some((area) => pathname === area || pathname.startsWith(`${area}/`));
  if (needsAccount && !getSessionCookie(request, { cookiePrefix: "coogcrave" })) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  const nonce = generateNonce();
  const csp = buildPageCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    upgradeInsecureRequests: process.env.APP_URL?.startsWith("https://") ?? false,
  });

  // Next.js reads the nonce from the request's CSP header and stamps it on its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes get their own strict CSP from next.config.ts; static assets need none.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
