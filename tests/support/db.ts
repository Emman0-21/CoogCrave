import { Pool } from "pg";

import { testDatabaseUrls } from "./test-env";

/** A short-lived pool for assertions made directly against the test database. */
export function openPool(role: "app" | "migrator"): Pool {
  const urls = testDatabaseUrls();
  return new Pool({ connectionString: role === "app" ? urls.app : urls.migrator, max: 2 });
}

/** Empties every application table (keeps the migrations journal). Runs as the migrator role. */
export async function resetDatabase(): Promise<void> {
  const pool = openPool("migrator");
  try {
    const { rows } = await pool.query<{ name: string }>(
      `select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
    );
    if (rows.length > 0) {
      await pool.query(`truncate table ${rows.map((r) => r.name).join(", ")} restart identity cascade`);
    }
  } finally {
    await pool.end();
  }
}
