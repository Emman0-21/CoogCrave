import { describe, expect, it } from "vitest";

import { ConfigError, parseConfig } from "@/server/config";

const valid = {
  APP_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://coogcrave_app:secret-pw@localhost:5432/coogcrave_dev",
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

  it("coerces numeric settings from strings", () => {
    expect(parseConfig({ ...valid, DB_POOL_MAX: "4" }).DB_POOL_MAX).toBe(4);
  });

  it("names every missing variable", () => {
    const error = captureConfigError({});
    expect(error.problems).toEqual(
      expect.arrayContaining(["APP_ENV is required", "APP_URL is required", "DATABASE_URL is required"]),
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

  it("requires https for deployed environments", () => {
    const error = captureConfigError({
      ...valid,
      APP_ENV: "production",
      APP_URL: "http://coogcrave.example",
    });
    expect(error.problems).toEqual(["APP_URL must use https in deployed environments"]);
    expect(
      parseConfig({ ...valid, APP_ENV: "production", APP_URL: "https://coogcrave.example" }).appOrigin,
    ).toBe("https://coogcrave.example");
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
