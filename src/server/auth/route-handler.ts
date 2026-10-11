import "server-only";

import type { Logger } from "pino";

import { getConfig } from "@/server/config";
import { clientIp } from "@/server/http/client-ip";
import { AppError, rateLimitedError } from "@/server/http/errors";
import {
  assertSameOrigin,
  DEFAULT_MAX_BODY_BYTES,
  mediaType,
  MUTATING_METHODS,
  parseJsonText,
  readBodyBytes,
  resolveRequestId,
  toErrorResponse,
  withHeader,
} from "@/server/http/request-guards";
import { getRateLimiter } from "@/server/http/route";
import { logger as rootLogger } from "@/server/logger";
import type { RateLimiter } from "@/server/rate-limit/rate-limiter";

import { getAuth } from "./auth";
import { authRateChecks, loggablePath } from "./rate-limits";

export interface AuthRouteDeps {
  /** Better Auth's request handler. */
  handle: (request: Request) => Promise<Response>;
  getAppOrigin: () => string;
  logger: Logger;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}

/**
 * Front door for /api/auth/* (docs/ARCHITECTURE.md §8). Better Auth does the authentication; this adds
 * the same protections /api/v1 has, which Better Auth either lacks or configures differently:
 *  - CSRF origin check on every mutation, including sign-in and sign-up (login CSRF)
 *  - JSON only: Better Auth also accepts form posts, which a cross-site page can submit without a preflight
 *  - 16 KB body limit, enforced on the stream
 *  - Postgres-backed per-IP and per-email rate limits
 *  - request IDs and one structured log line, with one-time tokens kept out of logged paths
 */
export function createAuthRouteHandler(deps: AuthRouteDeps) {
  const maxBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return async function authRoute(request: Request): Promise<Response> {
    const started = performance.now();
    const requestId = resolveRequestId(request.headers.get("x-request-id"));
    const log = deps.logger.child({ requestId });
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    const authPath = url.pathname.replace(/^\/api\/auth/, "") || "/";

    let response: Response;
    try {
      let forwarded = request;
      let body: unknown = {};

      if (MUTATING_METHODS.has(method)) {
        assertSameOrigin(request, deps.getAppOrigin());
        const bytes = await readBodyBytes(request, maxBytes);
        if (bytes.byteLength > 0) {
          if (mediaType(request) !== "application/json") {
            throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send the request body as application/json.");
          }
          body = parseJsonText(new TextDecoder().decode(bytes));
        }
        // The original stream has been read; hand Better Auth an identical request with the buffered body.
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        forwarded = new Request(request.url, {
          method,
          headers,
          body: bytes.byteLength > 0 ? bytes : undefined,
        });
      }

      for (const check of authRateChecks(method, authPath, body, clientIp(request.headers))) {
        const result = await deps.rateLimiter.consume(check.rule, check.subject);
        if (!result.allowed) {
          log.warn({ rule: check.rule.name }, "auth rate limit exceeded");
          throw rateLimitedError(result.retryAfterSeconds);
        }
      }

      response = await deps.handle(forwarded);
    } catch (error) {
      response = toErrorResponse(error, requestId, log);
    }

    response = withHeader(response, "x-request-id", requestId);
    const durationMs = Math.round(performance.now() - started);
    const line = { method, path: loggablePath(url.pathname), status: response.status, durationMs };
    if (response.status >= 500) log.error(line, "auth request failed");
    else log.info(line, "auth request");
    return response;
  };
}

/** The handler mounted at src/app/api/auth/[...all]/route.ts. */
export const authRouteHandler = createAuthRouteHandler({
  handle: (request) => getAuth().handler(request),
  getAppOrigin: () => getConfig().appOrigin,
  logger: rootLogger,
  rateLimiter: { consume: (rule, subject) => getRateLimiter().consume(rule, subject) },
});
