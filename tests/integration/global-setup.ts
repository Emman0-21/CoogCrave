import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { Pool } from "pg";

import { testDatabaseUrls } from "../support/test-env";

const MIGRATIONS_FOLDER = "db/migrations";
const TEST_MAIL_OUTBOX = ".data/test-mail";

/**
 * Runs once before all integration tests: apply committed migrations to the test database
 * (as the migrator role) and empty the test mail outbox.
 */
export default async function setup(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  await rm(TEST_MAIL_OUTBOX, { recursive: true, force: true });
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
