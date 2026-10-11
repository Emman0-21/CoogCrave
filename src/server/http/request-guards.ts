import type { Logger } from "pino";
import { z } from "zod";

import { AppError, errorEnvelope, type FieldError } from "./errors";
import { json } from "./respond";

/** Shared by withRoute (/api/v1) and the auth route handler (/api/auth). */

export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Accept a caller's request ID only if it is safe to echo into logs and headers. */
export function resolveRequestId(incoming: string | null): string {
  if (incoming && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * CSRF defense in depth (THREAT_MODEL T-20). Browsers attach Origin and/or Sec-Fetch-Site to
 * cross-site requests; any cross-site signal is rejected. Requests carrying neither header come
 * from non-browser clients, which cannot ride on a victim's cookies, so they are allowed.
 */
export function assertSameOrigin(request: Request, appOrigin: string): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const originMismatch = origin !== null && origin !== appOrigin;
  const crossSiteFetch = fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none";
  if (originMismatch || crossSiteFetch) {
    throw new AppError("FORBIDDEN", "Cross-origin requests are not allowed.");
  }
}

export function mediaType(request: Request): string | undefined {
  return request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
}

/** Reads the body, enforcing the limit on the declared length and on the bytes actually streamed. */
export async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const tooLarge = () => new AppError("PAYLOAD_TOO_LARGE", `Request body must be at most ${maxBytes} bytes.`);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) return new Uint8Array(0);

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
  return new Uint8Array(Buffer.concat(chunks));
}

export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
}

export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

export function toErrorResponse(error: unknown, requestId: string, log: Logger): Response {
  if (error instanceof AppError) {
    return json(errorEnvelope(error, requestId), { status: error.status, headers: error.headers });
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

/** Some Response objects (e.g. from Response.redirect) have immutable headers; copy when needed. */
export function withHeader(response: Response, name: string, value: string): Response {
  try {
    response.headers.set(name, value);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set(name, value);
    return copy;
  }
}
