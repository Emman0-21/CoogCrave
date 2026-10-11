/**
 * Best-effort client IP for rate limiting.
 *
 * Trust assumption (documented in docs/THREAT_MODEL.md T-14): the app runs behind a proxy that sets
 * X-Forwarded-For (Vercel overwrites it with the real client address). If the app were exposed
 * directly, clients could spoof the header to get fresh per-IP buckets; per-email limits still apply.
 * Requests with no address share one "unknown" bucket, which fails safe rather than open.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
