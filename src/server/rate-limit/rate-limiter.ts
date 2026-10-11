import "server-only";

import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";

export interface RateLimitRule {
  /** Stable name, part of the storage key, e.g. "auth.sign_in.ip". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window ends (for Retry-After). */
  retryAfterSeconds: number;
}

/** Port for rate limiting (docs/ARCHITECTURE.md §9). */
export interface RateLimiter {
  consume(rule: RateLimitRule, subject: string): Promise<RateLimitResult>;
}

/**
 * Subjects such as emails are hashed before storage, so the counters table never holds personal data.
 * IPs are hashed too, for the same reason; the hash only needs to be stable, not secret.
 */
export function rateLimitKey(rule: RateLimitRule, subject: string): string {
  const digest = createHash("sha256").update(subject.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `${rule.name}:${digest}`;
}

/**
 * Fixed-window counter in Postgres, shared by every server instance (an in-memory counter would reset
 * per serverless instance). One atomic upsert per request; the window boundary uses the database clock.
 * Tradeoff: a client can make up to 2× the limit across a window boundary. Acceptable for abuse control.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly pruneProbability = 0.01,
  ) {}

  async consume(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
    const key = rateLimitKey(rule, subject);
    const window = rule.windowSeconds;
    const result = await this.db.execute<{ count: number; retry_after: string }>(sql`
      insert into rate_limit_buckets (key, window_start, count)
      values (${key}, to_timestamp(floor(extract(epoch from now()) / ${window}) * ${window}), 1)
      on conflict (key, window_start) do update set count = rate_limit_buckets.count + 1
      returning count,
        ceil(extract(epoch from (window_start + make_interval(secs => ${window}) - now()))) as retry_after
    `);
    const row = result.rows[0];
    if (!row) throw new Error("rate limiter upsert returned no row");

    if (Math.random() < this.pruneProbability) {
      await this.db.execute(
        sql`delete from rate_limit_buckets where window_start < now() - interval '1 day'`,
      );
    }

    return {
      allowed: Number(row.count) <= rule.limit,
      retryAfterSeconds: Math.max(1, Number(row.retry_after)),
    };
  }
}
