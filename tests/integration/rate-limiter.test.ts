import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { PostgresRateLimiter, rateLimitKey } from "@/server/rate-limit/rate-limiter";

import { openPool, resetDatabase } from "../support/db";

describe("PostgresRateLimiter (real database, app role)", () => {
  let pool: Pool;
  let limiter: PostgresRateLimiter;
  const db = () => drizzle(pool, { schema });

  beforeAll(() => {
    pool = openPool("app");
    // A bigger pool than the default 2, so concurrent consumes really run in parallel.
    pool.options.max = 10;
    limiter = new PostgresRateLimiter(db(), 0);
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await pool.end();
  });

  const rule = { name: "test.rule", limit: 5, windowSeconds: 60 };

  it("allows up to the limit, then refuses with the seconds left in the window", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await limiter.consume(rule, "203.0.113.1"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, true, false]);
    const retry = results[5]!.retryAfterSeconds;
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
  });

  it("counts atomically under concurrency: exactly `limit` of 40 simultaneous requests pass", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => limiter.consume(rule, "203.0.113.2")));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const { rows } = await pool.query<{ count: number }>(
      "select count from rate_limit_buckets where key = $1",
      [rateLimitKey(rule, "203.0.113.2")],
    );
    expect(rows[0]?.count).toBe(40);
  });

  it("keeps separate buckets per subject and per rule", async () => {
    for (let i = 0; i < 5; i++) await limiter.consume(rule, "a");
    expect((await limiter.consume(rule, "a")).allowed).toBe(false);
    expect((await limiter.consume(rule, "b")).allowed).toBe(true);
    expect((await limiter.consume({ ...rule, name: "test.other" }, "a")).allowed).toBe(true);
  });

  it("starts fresh in the next window", async () => {
    for (let i = 0; i < 6; i++) await limiter.consume(rule, "c");
    // Move the bucket into the past, as if the window had elapsed.
    await db().execute(sql`
      update rate_limit_buckets set window_start = window_start - interval '2 minutes'
      where key = ${rateLimitKey(rule, "c")}
    `);
    expect((await limiter.consume(rule, "c")).allowed).toBe(true);
  });

  it("prunes buckets older than a day", async () => {
    const pruning = new PostgresRateLimiter(db(), 1);
    await pool.query(
      "insert into rate_limit_buckets (key, window_start, count) values ('old:x', now() - interval '2 days', 3)",
    );
    await pruning.consume(rule, "d");
    const { rows } = await pool.query("select key from rate_limit_buckets order by key");
    expect(rows.map((r: { key: string }) => r.key)).toEqual([rateLimitKey(rule, "d")]);
  });
});
