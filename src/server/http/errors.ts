/**
 * Domain/API error codes and their HTTP statuses. One table, so every route maps errors identically.
 * Codes are added here as the features that raise them are built (see docs/API_SPEC.md §1).
 */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_SUSPENDED: 403,
  COURIER_NOT_APPROVED: 403,
  COURIER_OFFLINE: 403,
  NOT_FOUND: 404,
  CART_RESTAURANT_CONFLICT: 409,
  PRICE_CHANGED: 409,
  INVALID_TRANSITION: 409,
  STALE_STATE: 409,
  OFFER_UNAVAILABLE: 409,
  COURIER_HAS_ACTIVE_DELIVERY: 409,
  COURIER_APPLICATION_EXISTS: 409,
  ACTIVE_DELIVERY_IN_PROGRESS: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INVALID_LOCATION: 422,
  ITEM_UNAVAILABLE: 422,
  INVALID_OPTIONS: 422,
  CART_FULL: 422,
  CART_EMPTY: 422,
  RESTAURANT_CLOSED: 422,
  BELOW_MINIMUM_SUBTOTAL: 422,
  TIP_OUT_OF_RANGE: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
  REASON_REQUIRED: 422,
  CANNOT_ACCEPT_OWN_ORDER: 422,
  CANNOT_MODERATE_SELF: 422,
  CANNOT_MODERATE_ADMIN: 422,
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
