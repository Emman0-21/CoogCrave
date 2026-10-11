/** Postgres SQLSTATE codes the services react to. */
export const PG_UNIQUE_VIOLATION = "23505";

interface PgErrorLike {
  code?: string;
  constraint?: string;
  cause?: unknown;
}

/**
 * The name of the unique constraint a query violated, or null for any other error. Drizzle wraps driver
 * errors, so this walks the cause chain to the Postgres error.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const candidate = current as PgErrorLike;
    if (candidate.code === PG_UNIQUE_VIOLATION) return candidate.constraint ?? "";
    current = candidate.cause;
  }
  return null;
}
