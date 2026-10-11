import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// The tests read SEED_DEMO_PASSWORD and MAIL_OUTBOX_DIR from the same .env the server uses.
loadEnv({ path: [".env.local", ".env"], quiet: true });

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

// Optional: use an already-installed Chromium instead of Playwright's own download
// (for machines that can't reach Playwright's CDN). CI leaves this unset.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

/**
 * E2E tests run against a production build (`pnpm build` first), as in docs/TESTING.md.
 * Locally, an already-running server on the port is reused.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // One worker in CI. The suite signs in about 40 times, all from 127.0.0.1, and the app allows 30 sign-ins
  // per IP per minute (a real protection we don't loosen for tests). On a fast CI runner with several
  // workers the whole suite finished in under a minute and tripped it; one worker spreads them out.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
