import { describe, expect, it } from "vitest";

import { checkHealth } from "@/server/health";
import { createLogger } from "@/server/logger";

const log = createLogger({ level: "silent" });

describe("checkHealth", () => {
  it("reports ok when the database answers", async () => {
    const response = await checkHealth({ pingDatabase: async () => {}, version: "abc123" }, log);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", db: "ok", version: "abc123" });
  });

  it("returns 503 without leaking the underlying error when the database is down", async () => {
    const response = await checkHealth(
      {
        pingDatabase: async () => {
          throw new Error(
            "connect ECONNREFUSED 10.0.0.5:5432 password authentication failed for coogcrave_app",
          );
        },
        version: "abc123",
      },
      log,
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "degraded", db: "error", version: "abc123" });
    expect(text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|coogcrave_app/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
