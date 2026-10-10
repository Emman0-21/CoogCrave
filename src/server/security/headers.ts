/**
 * Security headers shared by next.config.ts (static headers) and src/proxy.ts (per-request CSP).
 * Kept in one module so tests can assert the exact policy the app ships.
 * See docs/THREAT_MODEL.md T-21 (XSS) and T-25 (headers).
 */

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** Only when the app is served over HTTPS; on http://localhost it would break subresource loads. */
  upgradeInsecureRequests: boolean;
}

/**
 * Content-Security-Policy for HTML pages.
 * - Scripts: only those carrying this request's nonce ('strict-dynamic' lets them load their own chunks).
 * - Styles: stylesheets from our origin or nonce-tagged <style>; style *attributes* are allowed because
 *   UI primitives position popovers with inline style attributes, and attribute styles cannot execute script.
 * - No plugins, no framing, no third-party origins at all.
 */
export function buildPageCsp({ nonce, isDev, upgradeInsecureRequests }: CspOptions): string {
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (upgradeInsecureRequests) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** JSON API responses never render markup, so they get the most restrictive policy possible. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

export interface StaticHeader {
  key: string;
  value: string;
}

/** Headers applied to every response (pages, API, assets). HSTS only where HTTPS is guaranteed. */
export function buildStaticSecurityHeaders({ enableHsts }: { enableHsts: boolean }): StaticHeader[] {
  const headers: StaticHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (enableHsts) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }
  return headers;
}

/** 128 bits of randomness, base64-encoded, fresh for every request. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
