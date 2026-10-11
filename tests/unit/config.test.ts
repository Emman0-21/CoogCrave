import { describe, expect, it } from "vitest";

import { ConfigError, LOCAL_DEV_AUTH_SECRET, parseConfig } from "@/server/config";

const valid = {
  APP_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://coogcrave_app:secret-pw@localhost:5432/coogcrave_dev",
  BETTER_AUTH_SECRET: LOCAL_DEV_AUTH_SECRET,
};

describe("parseConfig", () => {
  it("accepts a valid environment and applies defaults", () => {
    const config = parseConfig(valid);
    expect(config.APP_ENV).toBe("development");
    expect(config.appOrigin).toBe("http://localhost:3000");
    expect(config.DB_POOL_MAX).toBe(10);
    expect(config.LOG_LEVEL).toBe("info");
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("keeps demo reset off unless asked, and refuses it in production (THREAT_MODEL T-29)", () => {
    expect(parseConfig(valid).DEMO_RESET_ENABLED).toBe(false);
    expect(parseConfig({ ...valid, DEMO_RESET_ENABLED: "true" }).DEMO_RESET_ENABLED).toBe(true);
    expect(captureConfigError({ ...valid, DEMO_RESET_ENABLED: "yes" }).problems).toEqual([
      "DEMO_RESET_ENABLED must be true or false",
    ]);
    const production = {
      ...valid,
      APP_ENV: "production",
      APP_URL: "https://coogcrave.example",
      BETTER_AUTH_SECRET: "x".repeat(40),
      DEMO_RESET_ENABLED: "true",
    };
    expect(captureConfigError(production).problems).toEqual(
      expect.arrayContaining([
        "DEMO_RESET_ENABLED can't be true in production; demo reset deletes data (THREAT_MODEL T-29)",
      ]),
    );
  });

  it("coerces numeric settings from strings", () => {
    expect(parseConfig({ ...valid, DB_POOL_MAX: "4" }).DB_POOL_MAX).toBe(4);
  });

  it("names every missing variable", () => {
    const error = captureConfigError({});
    expect(error.problems).toEqual(
      expect.arrayContaining([
        "APP_ENV is required",
        "APP_URL is required",
        "DATABASE_URL is required",
        "BETTER_AUTH_SECRET is required",
      ]),
    );
  });

  it("rejects malformed values without echoing them back (they may be secrets)", () => {
    const secretish = "mysql://root:hunter2@db/prod";
    const error = captureConfigError({ ...valid, DATABASE_URL: secretish });
    expect(error.problems).toEqual(["DATABASE_URL must be a postgres:// URL"]);
    expect(error.message).not.toContain("hunter2");
  });

  it("rejects unknown environment names and out-of-range pool sizes", () => {
    expect(captureConfigError({ ...valid, APP_ENV: "staging" }).problems[0]).toMatch(/^APP_ENV /);
    expect(captureConfigError({ ...valid, DB_POOL_MAX: "500" }).problems[0]).toMatch(/^DB_POOL_MAX /);
  });

  it("requires https, a real secret, and a real mail provider in deployed environments", () => {
    const deployed = { ...valid, APP_ENV: "production", APP_URL: "http://coogcrave.example" };
    expect(captureConfigError(deployed).problems).toEqual([
      "APP_URL must use https in deployed environments",
      "BETTER_AUTH_SECRET is the local placeholder; generate a real secret for deployed environments",
      "MAIL_TRANSPORT is 'file', which can't deliver email; deployed environments need a real mail provider (planned for Phase 8)",
    ]);
    // Preview deployments get the same rules; a real secret and https leave only the mail gap.
    const preview = {
      ...deployed,
      APP_ENV: "preview",
      APP_URL: "https://preview.example",
      BETTER_AUTH_SECRET: "x".repeat(40),
    };
    expect(captureConfigError(preview).problems).toEqual([expect.stringMatching(/^MAIL_TRANSPORT /)]);
  });

  it("requires an auth secret of at least 32 characters", () => {
    expect(captureConfigError({ ...valid, BETTER_AUTH_SECRET: "too-short" }).problems).toEqual([
      "BETTER_AUTH_SECRET must be at least 32 characters",
    ]);
  });

  it("parses the email domain allowlist, defaulting to uh.edu", () => {
    expect(parseConfig(valid).ALLOWED_EMAIL_DOMAINS).toEqual(["uh.edu"]);
    expect(
      parseConfig({ ...valid, ALLOWED_EMAIL_DOMAINS: " UH.edu, coogcrave.test ,," }).ALLOWED_EMAIL_DOMAINS,
    ).toEqual(["uh.edu", "coogcrave.test"]);
    expect(
      captureConfigError({ ...valid, ALLOWED_EMAIL_DOMAINS: "uh.edu, not a domain" }).problems[0],
    ).toMatch(/^ALLOWED_EMAIL_DOMAINS/);
    expect(captureConfigError({ ...valid, ALLOWED_EMAIL_DOMAINS: " , " }).problems[0]).toMatch(
      /at least one domain/,
    );
  });

  it("defaults mail to the local file outbox", () => {
    expect(parseConfig(valid)).toMatchObject({ MAIL_TRANSPORT: "file", MAIL_OUTBOX_DIR: ".data/mail" });
  });

  it("derives the origin without path or trailing slash", () => {
    expect(parseConfig({ ...valid, APP_URL: "https://app.example/some/path/" }).appOrigin).toBe(
      "https://app.example",
    );
  });
});

function captureConfigError(env: Record<string, string>): ConfigError {
  try {
    parseConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error("expected parseConfig to throw");
}
