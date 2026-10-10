/** Reads the integration-test database URLs, failing with setup instructions if they're missing. */
export function testDatabaseUrls(): { app: string; migrator: string } {
  const app = process.env.TEST_DATABASE_URL;
  const migrator = process.env.TEST_MIGRATOR_DATABASE_URL;
  if (!app || !migrator) {
    throw new Error(
      "Integration tests need TEST_DATABASE_URL and TEST_MIGRATOR_DATABASE_URL. " +
        "Copy .env.example to .env and start Postgres with `pnpm db:local:up` (or `docker compose up -d db`).",
    );
  }
  for (const url of [app, migrator]) {
    // Guardrail: integration tests wipe tables, so refuse anything that isn't clearly a test database.
    if (!new URL(url).pathname.endsWith("_test")) {
      throw new Error(
        `Refusing to run integration tests against a database whose name doesn't end in _test.`,
      );
    }
  }
  return { app, migrator };
}
