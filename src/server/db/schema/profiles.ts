import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { campusLocations } from "./campus";
import { timestamps, tz } from "./columns";
import { courierStatus, transportMode } from "./enums";

/** App-level profile, separate from auth tables so changing auth providers never touches app data. */
export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 60 }),
  defaultLocationId: uuid("default_location_id").references(() => campusLocations.id),
  ...timestamps,
});

export const courierProfiles = pgTable(
  "courier_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: courierStatus("status").notNull().default("PENDING"),
    transportMode: transportMode("transport_mode").notNull(),
    guidelinesAcceptedAt: tz("guidelines_accepted_at").notNull(),
    isOnline: boolean("is_online").notNull().default(false),
    onlineSince: tz("online_since"),
    appliedAt: tz("applied_at").notNull().defaultNow(),
    reviewedAt: tz("reviewed_at"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewNote: varchar("review_note", { length: 500 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("courier_profiles_user_unique").on(t.userId),
    // Only approved couriers can be online, whatever the application code does.
    check("courier_profiles_online_requires_approval", sql`not ${t.isOnline} or ${t.status} = 'APPROVED'`),
    index("courier_profiles_status_idx").on(t.status),
    index("courier_profiles_online_idx")
      .on(t.id)
      .where(sql`${t.isOnline}`),
  ],
);
