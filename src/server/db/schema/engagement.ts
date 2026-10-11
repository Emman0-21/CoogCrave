import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { tz } from "./columns";
import { notificationType } from "./enums";
import { orders } from "./orders";
import { courierProfiles } from "./profiles";

/** In-app notifications, written in the same transaction as the change that caused them. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 80 }).notNull(),
    body: varchar("body", { length: 200 }).notNull(),
    readAt: tz("read_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("notifications_user_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    courierId: uuid("courier_id")
      .notNull()
      .references(() => courierProfiles.id),
    rating: smallint("rating").notNull(),
    comment: varchar("comment", { length: 500 }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    // One review per order, even under double submit.
    uniqueIndex("reviews_order_unique").on(t.orderId),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
    index("reviews_courier_idx").on(t.courierId),
  ],
);
