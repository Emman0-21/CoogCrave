import { timestamp } from "drizzle-orm/pg-core";

/** timestamptz, returned as a JS Date. */
export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** created_at is set by the database; updated_at is refreshed by Drizzle on every update. */
export const timestamps = {
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Soft delete for catalog data that historical orders still reference. */
export const softDelete = {
  deletedAt: tz("deleted_at"),
};
