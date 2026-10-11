import { expect } from "vitest";

/** Postgres SQLSTATE codes the schema relies on. */
export const PG = {
  checkViolation: "23514",
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  insufficientPrivilege: "42501",
} as const;

interface PgErrorLike {
  code?: string;
  constraint?: string;
  cause?: unknown;
}

/** Drizzle wraps driver errors; walk the cause chain to the Postgres error. */
function findPgError(error: unknown): PgErrorLike | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const candidate = current as PgErrorLike;
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
    current = candidate.cause;
  }
  return undefined;
}

/** Asserts the operation fails with the given SQLSTATE (and constraint name, when given). */
export async function expectPgError(
  operation: Promise<unknown>,
  expected: { code: string; constraint?: string },
): Promise<void> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }
  expect(caught, "expected the database to reject this operation").toBeDefined();
  const pgError = findPgError(caught);
  expect(pgError?.code, `unexpected error: ${String(caught)}`).toBe(expected.code);
  if (expected.constraint) expect(pgError?.constraint).toBe(expected.constraint);
}
