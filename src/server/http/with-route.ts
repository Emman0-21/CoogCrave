import "server-only";

import type { Logger } from "pino";
import { z, type ZodType } from "zod";

import { getConfig } from "@/server/config";
import { logger as rootLogger } from "@/server/logger";

import { AppError, errorEnvelope, type FieldError } from "./errors";
import { json } from "./respond";

/**
 * withRoute wraps every /api/v1 handler (docs/ARCHITECTURE.md §5):
 *   request ID → CSRF origin check (mutations) → JSON + size checks → schema validation
 *   → handler → uniform error envelope → one structured log line.
 *
 * Authentication levels and rate limiting are added in Phase 3, when sessions and the
 * rate-limit table exist.
 */

export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export interface RouteOptions<P, Q, B> {
  params?: ZodType<P>;
  query?: ZodType<Q>;
  body?: ZodType<B>;
  maxBodyBytes?: number;
}

export interface RouteInput<P, Q, B> {
  request: Request;
  params: P;
  query: Q;
  body: B;
  requestId: string;
  log: Logger;
}

export type RouteHandler<P, Q, B> = (input: RouteInput<P, Q, B>) => Promise<Response>;

/** The shape Next.js passes as the second argument to route handlers. */
export interface NextRouteContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

export interface RouteWrapperDeps {
  getAppOrigin: () => string;
  logger: Logger;
}

export function createRouteWrapper(deps: RouteWrapperDeps) {
  return function withRoute<P = Record<string, never>, Q = Record<string, never>, B = undefined>(
    options: RouteOptions<P, Q, B>,
    handler: RouteHandler<P, Q, B>,
  ) {
    return async function route(request: Request, context?: NextRouteContext): Promise<Response> {
      const started = performance.now();
      const requestId = resolveRequestId(request.headers.get("x-request-id"));
      const log = deps.logger.child({ requestId });
      const method = request.method.toUpperCase();
      const path = new URL(request.url).pathname;

      let response: Response;
      try {
        if (MUTATING_METHODS.has(method)) assertSameOrigin(request, deps.getAppOrigin());

        const params = await parseParams(options.params, context);
        const query = parseQuery(options.query, request.url);
        const body = await parseBody(options.body, request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);

        response = await handler({ request, params, query, body, requestId, log });
      } catch (error) {
        response = toErrorResponse(error, requestId, log);
      }

      response.headers.set("x-request-id", requestId);
      const durationMs = Math.round(performance.now() - started);
      const line = { method, path, status: response.status, durationMs };
      if (response.status >= 500) log.error(line, "request failed");
      else log.info(line, "request");
      return response;
    };
  };
}

export const withRoute = createRouteWrapper({
  getAppOrigin: () => getConfig().appOrigin,
  logger: rootLogger,
});

// ---------------------------------------------------------------------------------------------

function resolveRequestId(incoming: string | null): string {
  // Accept a caller's ID only if it is safe to echo into logs and headers.
  if (incoming && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * CSRF defense in depth (THREAT_MODEL T-20). Browsers attach Origin and/or Sec-Fetch-Site to
 * cross-site requests; any cross-site signal is rejected. Requests carrying neither header come
 * from non-browser clients, which cannot ride on a victim's cookies, so they are allowed.
 */
function assertSameOrigin(request: Request, appOrigin: string): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const originMismatch = origin !== null && origin !== appOrigin;
  const crossSiteFetch = fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none";
  if (originMismatch || crossSiteFetch) {
    throw new AppError("FORBIDDEN", "Cross-origin requests are not allowed.");
  }
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

  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send the request body as application/json.");
  }

  const text = await readBodyWithLimit(request, maxBytes);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Request body is invalid.", toFieldErrors(result.error));
  }
  return result.data;
}

async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  const tooLarge = () => new AppError("PAYLOAD_TOO_LARGE", `Request body must be at most ${maxBytes} bytes.`);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) return "";

  // Content-Length can be absent or wrong (chunked uploads), so the stream itself is metered.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

function toErrorResponse(error: unknown, requestId: string, log: Logger): Response {
  if (error instanceof AppError) {
    return json(errorEnvelope(error, requestId), { status: error.status });
  }
  if (error instanceof z.ZodError) {
    const appError = new AppError("VALIDATION_ERROR", "Request is invalid.", toFieldErrors(error));
    return json(errorEnvelope(appError, requestId), { status: appError.status });
  }
  // Unexpected: full detail goes to logs only; the client gets a code and the request ID.
  log.error({ err: error }, "unhandled error");
  const internal = new AppError("INTERNAL_ERROR", "Something went wrong. Try again in a moment.");
  return json(errorEnvelope(internal, requestId), { status: internal.status });
}
