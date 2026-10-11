/**
 * pnpm db:seed:demo — create (or reset) the demo accounts. Requires SEED_DEMO_PASSWORD.
 * Refuses to run when APP_ENV=production. Run `pnpm db:seed` first so drop points exist.
 */
import { runCli } from "./cli";

import { getConfig } from "@/server/config";
import { closeDb, getDb } from "@/server/db/client";
import { DEMO_ACCOUNTS, seedDemoAccounts } from "@/server/seed/demo";

await runCli(async () => {
  const { APP_ENV } = getConfig();
  await seedDemoAccounts(getDb(), { password: process.env.SEED_DEMO_PASSWORD, appEnv: APP_ENV });
  console.log("Demo accounts ready (password: the SEED_DEMO_PASSWORD value):");
  for (const account of DEMO_ACCOUNTS) {
    const role =
      account.role === "ADMIN"
        ? "admin"
        : account.courier
          ? `courier, ${account.courier.status.toLowerCase()}`
          : "customer";
    console.log(`  ${account.email.padEnd(32)} ${role}`);
  }
}, closeDb);
