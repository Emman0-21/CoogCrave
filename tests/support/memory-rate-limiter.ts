import type { RateLimiter, RateLimitResult, RateLimitRule } from "@/server/rate-limit/rate-limiter";

/** In-memory RateLimiter for unit tests. Records every call so tests can assert keys and counts. */
export class MemoryRateLimiter implements RateLimiter {
  readonly counts = new Map<string, number>();
  readonly calls: { rule: string; subject: string }[] = [];

  async consume(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
    this.calls.push({ rule: rule.name, subject });
    const key = `${rule.name}:${subject}`;
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { allowed: count <= rule.limit, retryAfterSeconds: rule.windowSeconds };
  }
}
