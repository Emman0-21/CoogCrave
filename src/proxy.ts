import { NextResponse, type NextRequest } from "next/server";

import { buildPageCsp, generateNonce } from "@/server/security/headers";

/**
 * Runs before page requests. Its only job today is the per-request CSP nonce.
 *
 * This is NOT a security boundary for authorization (docs/ARCHITECTURE.md §8): later phases may add
 * signed-out redirects here for UX, but every access decision is enforced again in the service layer.
 */
export function proxy(request: NextRequest): NextResponse {
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
