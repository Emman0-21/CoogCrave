import "server-only";

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getConfig } from "@/server/config";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle from db.transaction(); has the same query API as Database. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the pool-backed database or an open transaction. */
export type DbExecutor = Database | Transaction;

interface DbHandle {
  pool: Pool;
  db: Database;
}

// One pool per server process. In development, hot reloads re-evaluate this module,
// so the handle is kept on globalThis to avoid leaking connections on every edit.
const globalForDb = globalThis as typeof globalThis & { __coogcraveDb?: DbHandle };

export function createDbHandle(connectionString: string, maxConnections: number): DbHandle {
  const pool = new Pool({ connectionString, max: maxConnections, connectionTimeoutMillis: 5_000 });
  return { pool, db: drizzle(pool, { schema }) };
}

function handle(): DbHandle {
  if (!globalForDb.__coogcraveDb) {
    const config = getConfig();
    globalForDb.__coogcraveDb = createDbHandle(config.DATABASE_URL, config.DB_POOL_MAX);
  }
  return globalForDb.__coogcraveDb;
}

/** The application database (connects as the least-privilege app role). */
export function getDb(): Database {
  return handle().db;
}

/** Closes the pool (CLI scripts and tests call this so the process can exit). */
export async function closeDb(): Promise<void> {
  const current = globalForDb.__coogcraveDb;
  globalForDb.__coogcraveDb = undefined;
  await current?.pool.end();
}

/** Cheap connectivity check used by /api/health. Rejects if the DB is unreachable or slow. */
export async function pingDatabase(db: Database = getDb(), timeoutMs = 2_000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`database ping exceeded ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
