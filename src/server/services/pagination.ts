import "server-only";

import { type AnyColumn, sql } from "drizzle-orm";

import { AppError } from "@/server/http/errors";

/**
 * Opaque keyset cursor: the (created_at, id) of the last row on the previous page. The timestamp is
 * Postgres's own microsecond-precision UTC text, not a JS Date (milliseconds), so rows that share a
 * millisecond are never skipped or repeated between pages. Used by every "newest first" list.
 */
const CURSOR_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeCursor(timestamp: string, id: string): string {
  return Buffer.from(`${timestamp}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { timestamp: string; id: string } {
  const [timestamp, id, extra] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (extra !== undefined || !timestamp || !id || !CURSOR_TS.test(timestamp) || !UUID.test(id)) {
    throw new AppError("VALIDATION_ERROR", "The cursor is invalid.", [
      { path: "cursor", message: "Invalid cursor." },
    ]);
  }
  return { timestamp, id };
}

/** SQL for a timestamptz column as microsecond UTC text, the cursor's timestamp format. */
export function microsecondTimestamp(column: AnyColumn) {
  return sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}
