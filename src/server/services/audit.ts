import "server-only";

import { and, desc, eq, type SQL, sql } from "drizzle-orm";

import { type Database, getDb } from "@/server/db/client";
import { auditEvents, users } from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { AppError } from "@/server/http/errors";

/** Who performed an audited action: a signed-in admin, or a script/CLI (no user). */
export type AuditActor = { kind: "ADMIN"; actor: Actor } | { kind: "SYSTEM"; label: string };

export interface AuditInput {
  by: AuditActor;
  /** Dotted verb, e.g. "courier.approve" (enforced by a database CHECK). */
  action: string;
  targetType: string;
  targetId: string;
  /** Changed fields, reasons, and context. Never secrets or passwords. */
  metadata?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Appends an audit event (PRD ADM-9). Pass the transaction that performs the audited change, so the
 * record and the change commit or roll back together. The app role can't update or delete these rows.
 */
export async function recordAudit(db: Pick<Database, "insert">, input: AuditInput): Promise<void> {
  const metadata = { ...input.metadata, ...(input.by.kind === "SYSTEM" ? { via: input.by.label } : {}) };
  await db.insert(auditEvents).values({
    actorType: input.by.kind,
    actorUserId: input.by.kind === "ADMIN" ? input.by.actor.userId : null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata,
    requestId: input.requestId ?? null,
  });
}

export interface AuditEventView {
  id: string;
  createdAt: string;
  actorType: "ADMIN" | "SYSTEM";
  actor: { id: string; name: string; email: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  requestId: string | null;
}

export interface AuditQuery {
  limit: number;
  cursor?: string;
  targetType?: string;
  targetId?: string;
  actorUserId?: string;
}

/**
 * Opaque keyset cursor: the (created_at, id) of the last row on the previous page. The timestamp is
 * Postgres's own microsecond-precision UTC text, not a JS Date (milliseconds), so rows that share a
 * millisecond are never skipped or repeated between pages.
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

const cursorTimestamp = sql<string>`to_char(${auditEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** GET /api/v1/admin/audit-events: newest first, keyset-paginated. Admin-only at the route. */
export async function listAuditEvents(
  query: AuditQuery,
  db: Database = getDb(),
): Promise<{ data: AuditEventView[]; nextCursor: string | null }> {
  const filters: SQL[] = [];
  if (query.targetType) filters.push(eq(auditEvents.targetType, query.targetType));
  if (query.targetId) filters.push(eq(auditEvents.targetId, query.targetId));
  if (query.actorUserId) filters.push(eq(auditEvents.actorUserId, query.actorUserId));
  if (query.cursor) {
    const { timestamp, id } = decodeCursor(query.cursor);
    filters.push(
      sql`(${auditEvents.createdAt}, ${auditEvents.id}) < (${timestamp}::timestamptz, ${id}::uuid)`,
    );
  }

  const rows = await db
    .select({ event: auditEvents, actorName: users.name, actorEmail: users.email, cursorTs: cursorTimestamp })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    data: page.map(({ event, actorName, actorEmail }) => ({
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      actorType: event.actorType === "ADMIN" ? "ADMIN" : "SYSTEM",
      actor:
        event.actorUserId && actorName && actorEmail
          ? { id: event.actorUserId, name: actorName, email: actorEmail }
          : null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: event.metadata,
      requestId: event.requestId,
    })),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.cursorTs, last.event.id) : null,
  };
}
