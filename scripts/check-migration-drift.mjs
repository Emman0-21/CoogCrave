#!/usr/bin/env node
// Fails if src/server/db/schema has changes that were not captured in a committed migration.
// Runs `drizzle-kit generate`; any new or modified file under db/migrations means drift.
import { execFileSync } from "node:child_process";

const MIGRATIONS_DIR = "db/migrations";

function changedMigrationFiles() {
  const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", MIGRATIONS_DIR], {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

const before = changedMigrationFiles();
if (before.length > 0) {
  console.error(`Uncommitted changes already exist in ${MIGRATIONS_DIR}; commit or discard them first:`);
  console.error(before.join("\n"));
  process.exit(1);
}

execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--name", "drift_check"], { stdio: "inherit" });

const after = changedMigrationFiles();
if (after.length > 0) {
  console.error("\nSchema drift: the Drizzle schema has changes with no committed migration.");
  console.error("Run `pnpm db:generate`, review the SQL, and commit it. Generated files:");
  console.error(after.join("\n"));
  process.exit(1);
}
console.log("No migration drift: schema and committed migrations agree.");
