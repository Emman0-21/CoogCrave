import type { NextConfig } from "next";

import { API_CSP, buildStaticSecurityHeaders } from "./src/server/security/headers";

// HSTS is only safe where HTTPS is guaranteed; local `next start` runs over plain HTTP.
const enableHsts = process.env.APP_ENV === "production" || process.env.APP_ENV === "preview";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Cache Components (and Partial Prefetching, which requires it) stay OFF on purpose:
  // the nonce-based CSP in src/proxy.ts needs every page rendered per request, and Next.js
  // documents nonce CSP as incompatible with the prerendered static shell. Revisit when upgrading
  // to a Next.js major where Cache Components can no longer be disabled. See docs/ARCHITECTURE.md §2.
  cacheComponents: false,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  async headers() {
    return [
      { source: "/:path*", headers: buildStaticSecurityHeaders({ enableHsts }) },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
  },
};

export default nextConfig;
