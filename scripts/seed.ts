/**
 * pnpm db:seed — load the sample campus catalog (drop points, sample restaurants, menus).
 * Safe to run repeatedly; it updates rows in place. Connects as the app role (DATABASE_URL).
 */
import { runCli } from "./cli";

import { closeDb, getDb } from "@/server/db/client";
import { seedCatalog } from "@/server/seed/catalog";

await runCli(async () => {
  const summary = await seedCatalog(getDb());
  console.log(
    `Seeded ${summary.locations} campus locations, ${summary.cuisines} cuisines, ` +
      `${summary.restaurants} sample restaurants with ${summary.menuItems} menu items.`,
  );
}, closeDb);
