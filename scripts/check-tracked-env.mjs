#!/usr/bin/env node
// Fails if any environment file other than .env.example is tracked by Git (THREAT_MODEL T-26).
import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => /(^|\/)\.env(\..+)?$/.test(path) && !path.endsWith(".env.example"));

if (tracked.length > 0) {
  console.error("Environment files must never be committed. Remove them from Git and rotate any secrets:");
  console.error(tracked.join("\n"));
  process.exit(1);
}
console.log("No environment files are tracked.");
