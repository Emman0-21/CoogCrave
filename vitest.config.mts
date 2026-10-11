import react from "@vitejs/plugin-react";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local runs read .env; CI provides variables directly (they take precedence).
loadEnv({ path: [".env.local", ".env"], quiet: true });

const serverOnlyStub = fileURLToPath(new URL("./tests/support/server-only-stub.ts", import.meta.url));

const shared = {
  // `server-only` throws outside a React Server bundle; under Vitest it is a no-op.
  resolve: { tsconfigPaths: true, alias: { "server-only": serverOnlyStub } },
};

export default defineConfig({
  plugins: [react()],
  ...shared,
  test: {
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts", "src/proxy.ts"],
      exclude: ["src/server/db/schema/**"],
      reporter: ["text", "html", "json-summary"],
      // PRD NFR-7: ≥ 80% on server logic. Per-folder thresholds for domain/ and services/ are
      // added in Phase 3 when those folders exist.
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/support/unit-env.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["tests/component/**/*.test.tsx"],
          setupFiles: ["tests/support/component-setup.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/support/integration-env.ts"],
          // One shared test database: run files one at a time so resets can't interleave.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
