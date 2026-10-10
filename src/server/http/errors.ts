/**
 * Domain/API error codes and their HTTP statuses. One table, so every route maps errors identically.
 * Codes are added here as the features that raise them are built (see docs/API_SPEC.md §1).
 */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
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
