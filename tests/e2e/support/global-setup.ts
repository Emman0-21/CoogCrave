import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

/**
 * Runs once before the E2E suite, against the database the app under test uses (DATABASE_URL):
 *  - clears rate-limit counters, so repeated local runs don't trip the sign-up/sign-in limits
 *  - checks that the demo accounts exist (they come from `pnpm db:seed && pnpm db:seed:demo`)
 */
export default async function globalSetup(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("E2E tests need DATABASE_URL (copy .env.example to .env).");
  if (!process.env.SEED_DEMO_PASSWORD)
    throw new Error("E2E tests need SEED_DEMO_PASSWORD (see .env.example).");

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("delete from rate_limit_buckets");
    const { rows } = await pool.query<{ n: string }>(
      "select count(*) as n from users where email in ('customer@demo.coogcrave.test', 'admin@demo.coogcrave.test')",
    );
    if (Number(rows[0]?.n) !== 2) {
      throw new Error(
        "Demo accounts are missing. Run `pnpm db:seed && pnpm db:seed:demo` before `pnpm test:e2e`.",
      );
    }
  } finally {
    await pool.end();
  }
}
