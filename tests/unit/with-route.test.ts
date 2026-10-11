import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError } from "@/server/http/errors";
import { json } from "@/server/http/respond";
import { createRouteWrapper, DEFAULT_MAX_BODY_BYTES } from "@/server/http/with-route";
import type { Actor } from "@/server/domain/actor";
import { createLogger } from "@/server/logger";

import { MemoryRateLimiter } from "../support/memory-rate-limiter";

const APP_ORIGIN = "https://coogcrave.test";

function setup() {
  const logs: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logs.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  const limiter = new MemoryRateLimiter();
  const state: { actor: Actor | null } = { actor: null };
  const withRoute = createRouteWrapper({
    getAppOrigin: () => APP_ORIGIN,
    logger: createLogger({ level: "info" }, stream),
    getActor: async () => state.actor,
    rateLimiter: limiter,
  });
  return { withRoute, logs, limiter, state };
}

const itemBody = z.strictObject({ menuItemId: z.uuid(), quantity: z.int().min(1).max(20) });
const validItem = { menuItemId: "7d0f5d36-2a43-4c38-9a5b-8d43cf3f2b11", quantity: 2 };

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_ORIGIN}/api/v1/cart/items`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function errorOf(response: Response) {
  const payload = (await response.json()) as {
    error: { code: string; message: string; details: unknown; requestId: string };
  };
  return payload.error;
}

describe("withRoute: happy path", () => {
  it("passes validated input to the handler and tags the response with a request ID", async () => {
    const { withRoute, logs } = setup();
    const route = withRoute({ auth: "public", body: itemBody }, async ({ body }) =>
      json({ received: body }, { status: 201 }),
    );

    const response = await route(post(validItem));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ received: validItem });
    expect(response.headers.get("x-request-id")).toMatch(/^req_[a-f0-9]{32}$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(logs.at(-1)).toMatchObject({
      msg: "request",
      method: "POST",
      path: "/api/v1/cart/items",
      status: 201,
    });
  });

  it("never logs request bodies", async () => {
    const { withRoute, logs } = setup();
    const route = withRoute({ auth: "public", body: z.strictObject({ secretNote: z.string() }) }, async () =>
      json({ ok: true }),
    );
    await route(post({ secretNote: "Room 214, knock twice" }));
    expect(JSON.stringify(logs)).not.toContain("Room 214");
  });

  it("reuses a safe incoming request ID and replaces an unsafe one", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public" }, async () => json({ ok: true }));
    const safe = await route(
      new Request(`${APP_ORIGIN}/api/x`, { headers: { "x-request-id": "trace_ABC-12345" } }),
    );
    expect(safe.headers.get("x-request-id")).toBe("trace_ABC-12345");
    for (const unsafeId of ['"><script>alert(1)</script>', "has spaces; and=more", "x".repeat(200)]) {
      const unsafe = await route(
        new Request(`${APP_ORIGIN}/api/x`, { headers: { "x-request-id": unsafeId } }),
      );
      expect(unsafe.headers.get("x-request-id")).toMatch(/^req_[a-f0-9]{32}$/);
    }
  });

  it("parses repeated query parameters into arrays", async () => {
    const { withRoute } = setup();
    const route = withRoute(
      {
        auth: "public",
        query: z.strictObject({
          status: z.array(z.string()).or(z.string()),
          limit: z.coerce.number().optional(),
        }),
      },
      async ({ query }) => json(query),
    );
    const response = await route(
      new Request(`${APP_ORIGIN}/api/v1/admin/orders?status=PLACED&status=CONFIRMED&limit=5`),
    );
    expect(await response.json()).toEqual({ status: ["PLACED", "CONFIRMED"], limit: 5 });
  });
});

describe("withRoute: CSRF defenses (THREAT_MODEL T-20)", () => {
  it("rejects mutations from another origin", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: itemBody }, async () => json({ ok: true }));
    const response = await route(post(validItem, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("FORBIDDEN");
  });

  it("rejects cross-site fetches signalled by Sec-Fetch-Site even without an Origin header", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public" }, async () => json({ ok: true }));
    for (const site of ["cross-site", "same-site"]) {
      const request = new Request(`${APP_ORIGIN}/api/v1/thing`, {
        method: "DELETE",
        headers: { "sec-fetch-site": site },
      });
      expect((await route(request)).status).toBe(403);
    }
  });

  it("allows same-origin browser requests and non-browser clients", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public" }, async () => json({ ok: true }));
    const browser = new Request(`${APP_ORIGIN}/api/v1/thing`, {
      method: "DELETE",
      headers: { origin: APP_ORIGIN, "sec-fetch-site": "same-origin" },
    });
    const cli = new Request(`${APP_ORIGIN}/api/v1/thing`, { method: "DELETE" });
    expect((await route(browser)).status).toBe(200);
    expect((await route(cli)).status).toBe(200);
  });

  it("does not apply the origin check to safe methods", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public" }, async () => json({ ok: true }));
    const response = await route(
      new Request(`${APP_ORIGIN}/api/v1/thing`, { headers: { origin: "https://elsewhere.example" } }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects form-encoded bodies, which cross-site forms can send without a preflight", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: itemBody }, async () => json({ ok: true }));
    const response = await route(post("quantity=2", { "content-type": "application/x-www-form-urlencoded" }));
    expect(response.status).toBe(415);
    expect((await errorOf(response)).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("accepts a JSON content type with a charset parameter", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: itemBody }, async () => json({ ok: true }));
    expect((await route(post(validItem, { "content-type": "application/json; charset=utf-8" }))).status).toBe(
      200,
    );
  });
});

describe("withRoute: input validation", () => {
  it("rejects unknown fields so clients can't mass-assign (e.g. role, price)", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: itemBody }, async () => json({ ok: true }));
    const response = await route(post({ ...validItem, priceCents: 1 }));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toEqual([expect.objectContaining({ path: "" })]);
    expect(JSON.stringify(error.details)).toContain("priceCents");
  });

  it("reports field-level errors with paths", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: itemBody }, async () => json({ ok: true }));
    const error = await errorOf(await route(post({ ...validItem, quantity: 99 })));
    expect(error.details).toEqual([expect.objectContaining({ path: "quantity" })]);
  });

  it("rejects malformed JSON", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: itemBody }, async () => json({ ok: true }));
    const response = await route(post("{not json"));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toBe("Request body must be valid JSON.");
  });

  it("reports invalid query parameters as a validation error", async () => {
    const { withRoute } = setup();
    const route = withRoute(
      { auth: "public", query: z.strictObject({ limit: z.coerce.number().int().max(50) }) },
      async () => json({ ok: true }),
    );
    const response = await route(new Request(`${APP_ORIGIN}/api/v1/orders?limit=500`));
    expect(response.status).toBe(400);
  });

  it("treats malformed path IDs as not found so probing reveals nothing", async () => {
    const { withRoute } = setup();
    const route = withRoute(
      { auth: "public", params: z.strictObject({ orderId: z.uuid() }) },
      async ({ params }) => json(params),
    );
    const bad = await route(new Request(`${APP_ORIGIN}/api/v1/orders/123`), {
      params: Promise.resolve({ orderId: "123" }),
    });
    expect(bad.status).toBe(404);
    expect((await errorOf(bad)).code).toBe("NOT_FOUND");

    const id = "7d0f5d36-2a43-4c38-9a5b-8d43cf3f2b11";
    const good = await route(new Request(`${APP_ORIGIN}/api/v1/orders/${id}`), {
      params: Promise.resolve({ orderId: id }),
    });
    expect(await good.json()).toEqual({ orderId: id });
  });
});

describe("withRoute: payload limits (THREAT_MODEL T-24)", () => {
  it("rejects a declared Content-Length over the limit before reading the body", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: z.unknown() }, async () => json({ ok: true }));
    const response = await route(post({}, { "content-length": String(DEFAULT_MAX_BODY_BYTES + 1) }));
    expect(response.status).toBe(413);
  });

  it("meters the stream when Content-Length is absent or understated", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: z.unknown(), maxBodyBytes: 1024 }, async () =>
      json({ ok: true }),
    );
    const big = JSON.stringify({ padding: "x".repeat(4096) });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(big);
        for (let i = 0; i < bytes.length; i += 512) controller.enqueue(bytes.slice(i, i + 512));
        controller.close();
      },
    });
    const request = new Request(`${APP_ORIGIN}/api/v1/thing`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_ORIGIN },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await route(request);
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("accepts a body exactly at the limit", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public", body: z.unknown(), maxBodyBytes: 64 }, async () =>
      json({ ok: true }),
    );
    const body = JSON.stringify({ p: "x".repeat(64 - '{"p":""}'.length) });
    expect(body.length).toBe(64);
    expect((await route(post(body))).status).toBe(200);
  });
});

describe("withRoute: errors (THREAT_MODEL T-31)", () => {
  it("maps AppErrors to their status with the standard envelope", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public" }, async () => {
      throw new AppError("NOT_FOUND", "Order not found.");
    });
    const response = await route(new Request(`${APP_ORIGIN}/api/v1/orders/x`));
    expect(response.status).toBe(404);
    const error = await errorOf(response);
    expect(error).toEqual({
      code: "NOT_FOUND",
      message: "Order not found.",
      details: null,
      requestId: response.headers.get("x-request-id"),
    });
  });

  it("hides unexpected errors from the client but logs them with the request ID", async () => {
    const { withRoute, logs } = setup();
    const route = withRoute({ auth: "public" }, async () => {
      throw new Error('relation "orders" does not exist at /srv/app/node_modules/pg/lib/client.js');
    });
    const response = await route(new Request(`${APP_ORIGIN}/api/v1/orders`));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toMatch(/relation|node_modules|client\.js/);
    const requestId = response.headers.get("x-request-id");
    expect(JSON.parse(text).error).toMatchObject({ code: "INTERNAL_ERROR", requestId });

    const errorLog = logs.find((l) => l.msg === "unhandled error");
    expect(errorLog).toMatchObject({ requestId, level: "error" });
    expect(JSON.stringify(errorLog)).toContain("does not exist");
    expect(logs.at(-1)).toMatchObject({ msg: "request failed", status: 500 });
  });

  it("maps a ZodError thrown inside a handler to a validation error", async () => {
    const { withRoute } = setup();
    const route = withRoute({ auth: "public" }, async () => {
      z.strictObject({ a: z.string() }).parse({ a: 1 });
      return json({ ok: true });
    });
    const response = await route(new Request(`${APP_ORIGIN}/api/v1/x`));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).details).toEqual([expect.objectContaining({ path: "a" })]);
  });
});

const verifiedStudent: Actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  name: "Alex Rivera",
  email: "alex@cougarnet.uh.edu",
  role: "STUDENT",
  emailVerified: true,
  suspended: false,
  courier: null,
};

describe("withRoute: access levels (THREAT_MODEL T-03)", () => {
  const get = () => new Request(`${APP_ORIGIN}/api/v1/me`);

  it("returns 401 UNAUTHENTICATED for signed-out callers on non-public routes", async () => {
    const { withRoute } = setup();
    for (const auth of ["user", "courier", "admin"] as const) {
      const response = await withRoute({ auth }, async () => json({ ok: true }))(get());
      expect(response.status).toBe(401);
      expect((await errorOf(response)).code).toBe("UNAUTHENTICATED");
    }
  });

  it("passes the resolved actor to the handler", async () => {
    const { withRoute, state } = setup();
    state.actor = verifiedStudent;
    const response = await withRoute({ auth: "user" }, async ({ actor }) => json({ id: actor.userId }))(
      get(),
    );
    expect(await response.json()).toEqual({ id: verifiedStudent.userId });
  });

  it("does not look up a session for public routes", async () => {
    let lookups = 0;
    const withRoute = createRouteWrapper({
      getAppOrigin: () => APP_ORIGIN,
      logger: createLogger({ level: "silent" }),
      getActor: async () => {
        lookups++;
        return verifiedStudent;
      },
      rateLimiter: new MemoryRateLimiter(),
    });
    const response = await withRoute({ auth: "public" }, async ({ actor }) => json({ actor }))(get());
    expect(await response.json()).toEqual({ actor: null });
    expect(lookups).toBe(0);
  });

  it("maps each denial to its documented status and code", async () => {
    const cases: [Partial<Actor>, "user" | "courier" | "admin", number, string][] = [
      [{ suspended: true }, "user", 403, "ACCOUNT_SUSPENDED"],
      [{ emailVerified: false }, "user", 403, "EMAIL_NOT_VERIFIED"],
      [{}, "courier", 403, "COURIER_NOT_APPROVED"],
      [{ courier: { id: "c", status: "PENDING", isOnline: false } }, "courier", 403, "COURIER_NOT_APPROVED"],
      [{}, "admin", 403, "FORBIDDEN"],
    ];
    for (const [overrides, auth, status, code] of cases) {
      const { withRoute, state } = setup();
      state.actor = { ...verifiedStudent, ...overrides };
      const response = await withRoute({ auth }, async () => json({ ok: true }))(get());
      expect(response.status, `${auth} with ${JSON.stringify(overrides)}`).toBe(status);
      expect((await errorOf(response)).code).toBe(code);
    }
  });

  it("logs the user ID for authenticated requests", async () => {
    const { withRoute, state, logs } = setup();
    state.actor = verifiedStudent;
    await withRoute({ auth: "user" }, async () => json({ ok: true }))(get());
    expect(logs.at(-1)).toMatchObject({ msg: "request", userId: verifiedStudent.userId });
  });
});

describe("withRoute: rate limits (THREAT_MODEL T-24)", () => {
  it("applies the default per-IP limit to every route and returns 429 with Retry-After", async () => {
    const { withRoute, limiter } = setup();
    const route = withRoute({ auth: "public" }, async () => json({ ok: true }));
    const request = () =>
      new Request(`${APP_ORIGIN}/api/v1/locations`, { headers: { "x-forwarded-for": "203.0.113.7" } });
    for (let i = 0; i < 300; i++) expect((await route(request())).status).toBe(200);
    const limited = await route(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await errorOf(limited)).code).toBe("RATE_LIMITED");
    expect(limiter.calls[0]).toEqual({ rule: "api.default.ip", subject: "203.0.113.7" });
  });

  it("applies per-user limits after authentication, keyed by user ID", async () => {
    const { withRoute, limiter, state } = setup();
    state.actor = verifiedStudent;
    const rule = { name: "test.user", limit: 2, windowSeconds: 30 };
    const route = withRoute({ auth: "user", rateLimits: [{ rule, by: "user" }] }, async () =>
      json({ ok: true }),
    );
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await route(new Request(`${APP_ORIGIN}/api/v1/x`))).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect(limiter.calls.filter((c) => c.rule === "test.user").map((c) => c.subject)).toEqual([
      verifiedStudent.userId,
      verifiedStudent.userId,
      verifiedStudent.userId,
    ]);
  });

  it("checks the per-IP limit before looking up the session", async () => {
    const order: string[] = [];
    const withRoute = createRouteWrapper({
      getAppOrigin: () => APP_ORIGIN,
      logger: createLogger({ level: "silent" }),
      getActor: async () => {
        order.push("session");
        return verifiedStudent;
      },
      rateLimiter: {
        consume: async (rule) => {
          order.push(rule.name);
          return { allowed: true, retryAfterSeconds: 1 };
        },
      },
    });
    await withRoute({ auth: "user" }, async () => json({ ok: true }))(new Request(`${APP_ORIGIN}/api/v1/x`));
    expect(order).toEqual(["api.default.ip", "session"]);
  });

  it("can opt out of rate limiting entirely (health checks)", async () => {
    const { withRoute, limiter } = setup();
    await withRoute({ auth: "public", rateLimits: false }, async () => json({ ok: true }))(
      new Request(`${APP_ORIGIN}/api/health`),
    );
    expect(limiter.calls).toHaveLength(0);
  });
});
