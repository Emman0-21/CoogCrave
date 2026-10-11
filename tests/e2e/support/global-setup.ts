import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

/**
 * Runs once before the E2E suite, against the database the app under test uses (DATABASE_URL):
 *  - clears rate-limit counters, so repeated local runs don't trip the sign-up/sign-in limits
 *  - checks that the demo accounts exist (they come from `pnpm db:seed && pnpm db:seed:demo`)
 *  - opens The Burger Joint around the clock, so the ordering journey doesn't depend on the time of day
 *  - removes earlier runs' orders and closes their courier applications (e2e.* accounts only)
 *  - makes sure the menu items and restaurants the journeys edit are back on (a failed run may leave
 *    one sold out or closed)
 */
export default async function globalSetup(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("E2E tests need DATABASE_URL (copy .env.example to .env).");
  if (!process.env.SEED_DEMO_PASSWORD)
    throw new Error("E2E tests need SEED_DEMO_PASSWORD (see .env.example).");

  const pool = new Pool({ connectionString: url, max: 2 });
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
    // Orders from earlier E2E runs (accounts the suites created, e2e.*) would show up as stale courier
    // offers and kitchen tickets. Remove them; deleting an order removes its history, assignments, and
    // payment with it. Demo and personal accounts are never touched.
    await pool.query(
      `delete from orders where customer_id in (select id from users where email like 'e2e.%@cougarnet.uh.edu')`,
    );
    // Applications from earlier runs would pile up in the admin review queue; close them as not approved.
    await pool.query(
      `update courier_profiles set status = 'REJECTED', is_online = false, online_since = null
       where status = 'PENDING' and user_id in (select id from users where email like 'e2e.%@cougarnet.uh.edu')`,
    );
    await pool.query(
      `update menu_items set is_available = true
       where restaurant_id in (select id from restaurants where slug in ('the-burger-joint', 'the-taco-stand'))`,
    );
    await pool.query(
      `update restaurants set is_accepting_orders = true where slug in ('the-burger-joint', 'the-taco-stand')`,
    );
    // The ordering journey needs a restaurant that's open whatever time the suite runs. Open The Burger
    // Joint all week in this (development) database; `pnpm db:seed` puts its sample hours back.
    // Two statements: in one statement (a data-modifying CTE) the insert wouldn't see the delete.
    const client = await pool.connect();
    let open;
    try {
      await client.query("begin");
      await client.query(
        `delete from restaurant_hours
         where restaurant_id in (select id from restaurants where slug = 'the-burger-joint')`,
      );
      open = await client.query(
        `insert into restaurant_hours (restaurant_id, day_of_week, opens_at_minute, closes_at_minute)
         select r.id, d, 0, 1440 from restaurants r, generate_series(0, 6) as d
         where r.slug = 'the-burger-joint' and r.deleted_at is null`,
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    if (open.rowCount !== 7) {
      throw new Error("The Burger Joint is missing. Run `pnpm db:seed` before `pnpm test:e2e`.");
    }
  } finally {
    await pool.end();
  }
}
