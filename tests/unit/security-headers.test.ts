import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { API_CSP, buildPageCsp, buildStaticSecurityHeaders, generateNonce } from "@/server/security/headers";

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name!, values.join(" ")];
    }),
  );
}

describe("page Content-Security-Policy (THREAT_MODEL T-21)", () => {
  const prod = directives(buildPageCsp({ nonce: "abc123==", isDev: false, upgradeInsecureRequests: true }));

  it("only allows scripts that carry this request's nonce", () => {
    expect(prod.get("script-src")).toBe("'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(prod.get("script-src")).not.toContain("unsafe-inline");
    expect(prod.get("script-src")).not.toContain("unsafe-eval");
  });

  it("blocks plugins, framing, foreign origins, and base-tag hijacking", () => {
    expect(prod.get("default-src")).toBe("'self'");
    expect(prod.get("object-src")).toBe("'none'");
    expect(prod.get("frame-ancestors")).toBe("'none'");
    expect(prod.get("base-uri")).toBe("'self'");
    expect(prod.get("form-action")).toBe("'self'");
    expect(prod.get("font-src")).toBe("'self'");
  });

  it("allows eval and dev websockets only in development", () => {
    const dev = directives(buildPageCsp({ nonce: "n", isDev: true, upgradeInsecureRequests: false }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toBe("'self' ws: wss:");
    expect(prod.get("connect-src")).toBe("'self'");
  });

  it("upgrades insecure requests only when served over https", () => {
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
    const local = directives(buildPageCsp({ nonce: "n", isDev: false, upgradeInsecureRequests: false }));
    expect(local.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("static security headers (THREAT_MODEL T-25)", () => {
  it("sets nosniff, referrer, framing, permissions and opener policies", () => {
    const headers = Object.fromEntries(
      buildStaticSecurityHeaders({ enableHsts: false }).map((h) => [h.key, h.value]),
    );
    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("adds HSTS only when enabled", () => {
    const keys = buildStaticSecurityHeaders({ enableHsts: true }).map((h) => h.key);
    expect(keys).toContain("Strict-Transport-Security");
  });

  it("is wired into next.config for every path, with a deny-all CSP on API routes", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    const api = rules.find((r) => r.source === "/api/:path*");
    expect(all?.headers.map((h) => h.key)).toContain("X-Content-Type-Options");
    expect(api?.headers).toEqual([{ key: "Content-Security-Policy", value: API_CSP }]);
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("generateNonce", () => {
  it("returns 128-bit base64 values that do not repeat", () => {
    const nonces = new Set(Array.from({ length: 200 }, generateNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    }
  });
});
