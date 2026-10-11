/**
 * Domain/API error codes and their HTTP statuses. One table, so every route maps errors identically.
 * Codes are added here as the features that raise them are built (see docs/API_SPEC.md §1).
 */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_SUSPENDED: 403,
  COURIER_NOT_APPROVED: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INVALID_LOCATION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface FieldError {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: unknown = null,
    /** Extra response headers, e.g. Retry-After for RATE_LIMITED. */
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AppError";
    this.status = ERROR_STATUS[code];
  }
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details: unknown;
    requestId: string;
  };
}

export function errorEnvelope(error: AppError, requestId: string): ErrorEnvelope {
  return { error: { code: error.code, message: error.message, details: error.details, requestId } };
}

export function rateLimitedError(retryAfterSeconds: number): AppError {
  return new AppError("RATE_LIMITED", "Too many requests. Wait a moment and try again.", null, {
    "retry-after": String(retryAfterSeconds),
  });
}
