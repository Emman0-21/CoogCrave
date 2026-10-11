import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createAuthRouteHandler } from "@/server/auth/route-handler";
import { createLogger } from "@/server/logger";

import { MemoryRateLimiter } from "../support/memory-rate-limiter";

const ORIGIN = "https://coogcrave.test";

function setup(handle: (request: Request) => Promise<Response> = async () => Response.json({ ok: true })) {
  const logs: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logs.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  const seen: { request?: Request; body?: string } = {};
  const limiter = new MemoryRateLimiter();
  const route = createAuthRouteHandler({
    handle: async (request) => {
      seen.request = request;
      seen.body = await request.text();
      return handle(request);
    },
    getAppOrigin: () => ORIGIN,
    logger: createLogger({ level: "info" }, stream),
    rateLimiter: limiter,
    maxBodyBytes: 1024,
  });
  return { route, logs, seen, limiter };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": "203.0.113.5",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("auth route handler", () => {
  it("forwards the buffered body unchanged to Better Auth", async () => {
    const { route, seen } = setup();
    const payload = { email: "a@uh.edu", password: "violet-harbor-cactus-91", note: "ünïcødé ✓" };
    const response = await route(post("/sign-in/email", payload));
    expect(response.status).toBe(200);
    expect(JSON.parse(seen.body!)).toEqual(payload);
    expect(seen.request!.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("x-request-id")).toMatch(/^req_/);
  });

  it("forwards bodyless POSTs (sign-out) without requiring a content type", async () => {
    const { route, seen } = setup();
    const response = await route(
      new Request(`${ORIGIN}/api/auth/sign-out`, { method: "POST", headers: { origin: ORIGIN } }),
    );
    expect(response.status).toBe(200);
    expect(seen.body).toBe("");
  });

  it("rejects cross-origin posts, form bodies, invalid JSON, and oversized bodies before Better Auth runs", async () => {
    const cases: [Request, number][] = [
      [post("/sign-in/email", {}, { origin: "https://evil.example" }), 403],
      [post("/sign-in/email", "email=a", { "content-type": "application/x-www-form-urlencoded" }), 415],
      [post("/sign-in/email", "{not json"), 400],
      [post("/sign-up/email", { padding: "x".repeat(2000) }), 413],
    ];
    for (const [request, status] of cases) {
      const { route, seen } = setup();
      expect((await route(request)).status).toBe(status);
      expect(seen.request).toBeUndefined();
    }
  });

  it("returns 429 with Retry-After once a limit is exceeded", async () => {
    const { route, seen } = setup();
    for (let i = 0; i < 10; i++)
      await route(
        post(
          "/sign-in/email",
          { email: "a@uh.edu", password: "x" },
          { "x-forwarded-for": `198.51.100.${i}` },
        ),
      );
    seen.request = undefined;
    const limited = await route(
      post("/sign-in/email", { email: "a@uh.edu", password: "x" }, { "x-forwarded-for": "198.51.100.99" }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe(String(15 * 60));
    expect(seen.request).toBeUndefined();
  });

  it("adds the request ID even to redirect responses with immutable headers", async () => {
    const { route } = setup(async () => Response.redirect(`${ORIGIN}/sign-in?verified=1`, 302));
    const response = await route(
      new Request(`${ORIGIN}/api/auth/verify-email?token=abc&callbackURL=%2Fsign-in`),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?verified=1`);
    expect(response.headers.get("x-request-id")).toMatch(/^req_/);
  });

  it("never logs query strings or reset tokens", async () => {
    const { route, logs } = setup(
      async () => new Response(null, { status: 302, headers: { location: "/reset-password" } }),
    );
    await route(
      new Request(`${ORIGIN}/api/auth/reset-password/SECRETTOKEN123?callbackURL=%2Freset-password`),
    );
    await route(new Request(`${ORIGIN}/api/auth/verify-email?token=SECRETJWT&callbackURL=%2F`));
    const text = JSON.stringify(logs);
    expect(text).not.toContain("SECRETTOKEN123");
    expect(text).not.toContain("SECRETJWT");
    expect(logs.map((l) => l.path)).toEqual(["/api/auth/reset-password/:token", "/api/auth/verify-email"]);
  });

  it("hides Better Auth crashes behind a generic 500 with the request ID", async () => {
    const { route, logs } = setup(async () => {
      throw new Error("adapter exploded: connection to 10.0.0.3 refused");
    });
    const response = await route(post("/sign-in/email", { email: "a@uh.edu" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("10.0.0.3");
    expect(logs.some((l) => l.msg === "auth request failed")).toBe(true);
  });
});
