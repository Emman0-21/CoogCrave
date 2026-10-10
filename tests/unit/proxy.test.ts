import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

describe("proxy: per-request CSP nonce", () => {
  it("sets a CSP response header whose nonce is also passed to rendering", () => {
    const response = proxy(new NextRequest("http://localhost:3000/"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);

    // NextResponse.next({ request: { headers } }) forwards overridden request headers via x-middleware-request-*.
    const forwardedNonce = response.headers.get("x-middleware-request-x-nonce");
    const forwardedCsp = response.headers.get("x-middleware-request-content-security-policy");
    expect(forwardedNonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${forwardedNonce}'`);
    expect(forwardedCsp).toBe(csp);
  });

  it("issues a different nonce for every request", () => {
    const a = proxy(new NextRequest("http://localhost:3000/")).headers.get("x-middleware-request-x-nonce");
    const b = proxy(new NextRequest("http://localhost:3000/")).headers.get("x-middleware-request-x-nonce");
    expect(a).not.toBe(b);
  });

  it("runs on pages but not on API routes, static assets, or prefetches", () => {
    const matches = (url: string, headers?: Record<string, string>) =>
      unstable_doesMiddlewareMatch({ config, url, headers });
    expect(matches("/")).toBe(true);
    expect(matches("/restaurants/cougar-grill")).toBe(true);
    expect(matches("/api/health")).toBe(false);
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/", { "next-router-prefetch": "1" })).toBe(false);
  });
});
