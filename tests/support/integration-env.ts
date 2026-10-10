import { testDatabaseUrls } from "./test-env";

// The app under test connects exactly like production: as the least-privilege app role,
// but against the dedicated test database.
const { app } = testDatabaseUrls();
process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = app;
process.env.LOG_LEVEL = "silent";
