import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env files itself. Shell/CI variables take precedence over files.
loadEnv({ path: [".env.local", ".env"], quiet: true });

// Migrations run as the migrator role (owns the schema). The app itself uses DATABASE_URL (app role).
const url = process.env.MIGRATOR_DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./db/migrations",
  strict: true,
  verbose: true,
  ...(url ? { dbCredentials: { url } } : {}),
});
