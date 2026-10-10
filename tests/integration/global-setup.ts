import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync } from "node:fs";
import { Pool } from "pg";

import { testDatabaseUrls } from "../support/test-env";

const MIGRATIONS_FOLDER = "db/migrations";

/** Runs once before all integration tests: apply committed migrations to the test database. */
export default async function setup(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const { migrator } = testDatabaseUrls();
  const pool = new Pool({ connectionString: migrator, max: 1 });
  try {
    await pool.query("select 1");
    if (existsSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`)) {
      await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    }
  } finally {
    await pool.end();
  }
}
