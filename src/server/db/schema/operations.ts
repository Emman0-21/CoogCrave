import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { tz } from "./columns";
import { actorType } from "./enums";

/**
 * Append-only record of administrative actions (PRD ADM-9). The app role can insert and read
 * but not update or delete (see the grants migration). metadata never holds secrets.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ADMIN for actions taken in the app; SYSTEM for CLI and scripted actions (no signed-in user).
    actorType: actorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    requestId: varchar("request_id", { length: 64 }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("audit_events_actor_kind", sql`${t.actorType} in ('ADMIN', 'SYSTEM')`),
    check("audit_events_admin_has_user", sql`${t.actorType} <> 'ADMIN' or ${t.actorUserId} is not null`),
    check("audit_events_action_format", sql`${t.action} ~ '^[a-z_]+(\\.[a-z_]+)+$'`),
    index("audit_events_created_idx").on(t.createdAt.desc()),
    index("audit_events_target_idx").on(t.targetType, t.targetId),
  ],
);

/** Fixed-window request counters shared by every server instance (docs/ARCHITECTURE.md §9). */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: varchar("key", { length: 200 }).notNull(),
    windowStart: tz("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index("rate_limit_buckets_window_idx").on(t.windowStart),
  ],
);
