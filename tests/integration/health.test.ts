import { afterAll, describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health against the real test database", () => {
  afterAll(async () => {
    // Close the app's pool so the test process exits cleanly.
    const handle = (globalThis as { __coogcraveDb?: { pool: { end: () => Promise<void> } } }).__coogcraveDb;
    await handle?.pool.end();
  });

  it("round-trips to Postgres as the app role and reports ok", async () => {
    const response = await GET(new Request("http://localhost:3000/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", db: "ok", version: expect.any(String) });
    expect(response.headers.get("x-request-id")).toMatch(/^req_/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
