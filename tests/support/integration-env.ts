import { testDatabaseUrls } from "./test-env";

// The app under test connects exactly like production: as the least-privilege app role,
// but against the dedicated test database. Auth and mail settings are fixed so tests don't
// depend on whatever is in a developer's .env.
const { app } = testDatabaseUrls();
process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = app;
process.env.LOG_LEVEL = "silent";
process.env.BETTER_AUTH_SECRET = "integration-test-secret-0123456789-abcdefghij";
process.env.ALLOWED_EMAIL_DOMAINS = "uh.edu";
process.env.MAIL_TRANSPORT = "file";
process.env.MAIL_OUTBOX_DIR = ".data/test-mail";
