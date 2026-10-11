import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { softDelete, timestamps } from "./columns";

/** Per-campus configuration. One row (UH main) in the MVP; multi-campus is a data change later. */
export const campuses = pgTable(
  "campuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 40 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    deliveryFeeCents: integer("delivery_fee_cents").notNull(),
    serviceFeeBps: integer("service_fee_bps").notNull(),
    serviceFeeMinCents: integer("service_fee_min_cents").notNull(),
    serviceFeeMaxCents: integer("service_fee_max_cents").notNull(),
    // Sample rate for the demo, labeled as such in the UI.
    taxRateBps: integer("tax_rate_bps").notNull(),
    minSubtotalCents: integer("min_subtotal_cents").notNull(),
    maxTipCents: integer("max_tip_cents").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("campuses_slug_unique").on(t.slug),
    check("campuses_delivery_fee_nonneg", sql`${t.deliveryFeeCents} >= 0`),
    check("campuses_service_fee_bps_range", sql`${t.serviceFeeBps} between 0 and 10000`),
    check("campuses_tax_bps_range", sql`${t.taxRateBps} between 0 and 10000`),
    check(
      "campuses_service_fee_bounds",
      sql`${t.serviceFeeMinCents} >= 0 and ${t.serviceFeeMinCents} <= ${t.serviceFeeMaxCents}`,
    ),
    check("campuses_min_subtotal_nonneg", sql`${t.minSubtotalCents} >= 0`),
    check("campuses_max_tip_nonneg", sql`${t.maxTipCents} >= 0`),
  ],
);

/** Buildings and landmarks: restaurant pickup sites and customer drop points. */
export const campusLocations = pgTable(
  "campus_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campusId: uuid("campus_id")
      .notNull()
      .references(() => campuses.id),
    name: varchar("name", { length: 120 }).notNull(),
    shortName: varchar("short_name", { length: 40 }).notNull(),
    description: text("description"),
    isDropPoint: boolean("is_drop_point").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("campus_locations_name_unique")
      .on(t.campusId, t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);
