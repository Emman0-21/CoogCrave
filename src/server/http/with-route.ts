import "server-only";

import type { Logger } from "pino";
import type { ZodType } from "zod";

import type { Actor } from "@/server/domain/actor";
import { type AccessDenial, type AccessLevel, checkAccess } from "@/server/domain/policies";
import type { RateLimiter, RateLimitRule } from "@/server/rate-limit/rate-limiter";

import { clientIp } from "./client-ip";
import { AppError, type ErrorCode, rateLimitedError } from "./errors";
import {
  assertSameOrigin,
  DEFAULT_MAX_BODY_BYTES,
  mediaType,
  MUTATING_METHODS,
  parseJsonText,
  readBodyBytes,
  resolveRequestId,
  toErrorResponse,
  toFieldErrors,
} from "./request-guards";

/**
 * withRoute wraps every /api/v1 handler (docs/ARCHITECTURE.md §5):
 *   request ID → CSRF origin check (mutations) → per-IP rate limit → session → access level
 *   → per-user rate limits → params/query/body validation → handler → error envelope → one log line.
 *
 * `auth` is required on every route, so a forgotten access level is a type error, not an open endpoint.
 */

export { DEFAULT_MAX_BODY_BYTES };

/** Applies to every /api/v1 route unless the route opts out (docs/API_SPEC.md §1). */
export const DEFAULT_IP_RATE_LIMIT: RateLimitRule = { name: "api.default.ip", limit: 300, windowSeconds: 60 };

export interface RouteRateLimit {
  rule: RateLimitRule;
  by: "ip" | "user";
}

export interface RouteOptions<L extends AccessLevel, P, Q, B> {
  auth: L;
  /** Extra limits on top of the default per-IP limit; `false` disables all limits (health checks only). */
  rateLimits?: RouteRateLimit[] | false;
  params?: ZodType<P>;
  query?: ZodType<Q>;
  body?: ZodType<B>;
  maxBodyBytes?: number;
}

export interface RouteInput<L extends AccessLevel, P, Q, B> {
  request: Request;
  actor: L extends "public" ? null : Actor;
  params: P;
  query: Q;
  body: B;
  requestId: string;
  log: Logger;
}

export type RouteHandler<L extends AccessLevel, P, Q, B> = (
  input: RouteInput<L, P, Q, B>,
) => Promise<Response>;

/** The shape Next.js passes as the second argument to route handlers. */
export interface NextRouteContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

export interface RouteWrapperDeps {
  getAppOrigin: () => string;
  logger: Logger;
  getActor: (request: Request) => Promise<Actor | null>;
  rateLimiter: RateLimiter;
}

const DENIAL_MESSAGES: Record<AccessDenial, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  ACCOUNT_SUSPENDED: "This account is suspended.",
  EMAIL_NOT_VERIFIED: "Verify your email address to continue.",
  COURIER_NOT_APPROVED: "This needs an approved courier account.",
  FORBIDDEN: "You don't have access to this.",
};

export function createRouteWrapper(deps: RouteWrapperDeps) {
  return function withRoute<
    L extends AccessLevel,
    P = Record<string, never>,
    Q = Record<string, never>,
    B = undefined,
  >(options: RouteOptions<L, P, Q, B>, handler: RouteHandler<L, P, Q, B>) {
    return async function route(request: Request, context?: NextRouteContext): Promise<Response> {
      const started = performance.now();
      const requestId = resolveRequestId(request.headers.get("x-request-id"));
      const log = deps.logger.child({ requestId });
      const method = request.method.toUpperCase();
      const path = new URL(request.url).pathname;
      let userId: string | undefined;

      let response: Response;
      try {
        if (MUTATING_METHODS.has(method)) assertSameOrigin(request, deps.getAppOrigin());

        const limits =
          options.rateLimits === false
            ? []
            : [{ rule: DEFAULT_IP_RATE_LIMIT, by: "ip" as const }, ...(options.rateLimits ?? [])];
        const ip = clientIp(request.headers);
        for (const limit of limits.filter((l) => l.by === "ip")) {
          await enforce(deps.rateLimiter, limit.rule, ip);
        }

        let actor: Actor | null = null;
        if (options.auth !== "public") {
          actor = await deps.getActor(request);
          const decision = checkAccess(options.auth, actor);
          if (!decision.allowed) {
            throw new AppError(decision.reason satisfies ErrorCode, DENIAL_MESSAGES[decision.reason]);
          }
          userId = actor?.userId;
          for (const limit of limits.filter((l) => l.by === "user")) {
            await enforce(deps.rateLimiter, limit.rule, actor!.userId);
          }
        }

        const params = await parseParams(options.params, context);
        const query = parseQuery(options.query, request.url);
        const body = await parseBody(options.body, request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);

        response = await handler({
          request,
          actor: actor as RouteInput<L, P, Q, B>["actor"],
          params,
          query,
          body,
          requestId,
          log,
        });
      } catch (error) {
        response = toErrorResponse(error, requestId, log);
      }

      response.headers.set("x-request-id", requestId);
      const durationMs = Math.round(performance.now() - started);
      const line = { method, path, status: response.status, durationMs, ...(userId ? { userId } : {}) };
      if (response.status >= 500) log.error(line, "request failed");
      else log.info(line, "request");
      return response;
    };
  };
}

async function enforce(limiter: RateLimiter, rule: RateLimitRule, subject: string): Promise<void> {
  const result = await limiter.consume(rule, subject);
  if (!result.allowed) throw rateLimitedError(result.retryAfterSeconds);
}

async function parseParams<P>(schema: ZodType<P> | undefined, context?: NextRouteContext): Promise<P> {
  const raw = context ? await context.params : {};
  if (!schema) return {} as P;
  const result = schema.safeParse(raw);
  // A malformed ID is reported as "not found" so probing reveals nothing (API_SPEC §1).
  if (!result.success) throw new AppError("NOT_FOUND", "Resource not found.");
  return result.data;
}

function parseQuery<Q>(schema: ZodType<Q> | undefined, url: string): Q {
  if (!schema) return {} as Q;
  const raw: Record<string, string | string[]> = {};
  for (const [key, value] of new URL(url).searchParams) {
    const existing = raw[key];
    raw[key] =
      existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Query parameters are invalid.", toFieldErrors(result.error));
  }
  return result.data;
}

async function parseBody<B>(schema: ZodType<B> | undefined, request: Request, maxBytes: number): Promise<B> {
  if (!schema) return undefined as B;
  if (mediaType(request) !== "application/json") {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send the request body as application/json.");
  }
  const data = parseJsonText(new TextDecoder().decode(await readBodyBytes(request, maxBytes)));
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Request body is invalid.", toFieldErrors(result.error));
  }
  return result.data;
}
