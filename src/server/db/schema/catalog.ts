import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { campuses, campusLocations } from "./campus";
import { softDelete, timestamps } from "./columns";

export const restaurants = pgTable(
  "restaurants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campusId: uuid("campus_id")
      .notNull()
      .references(() => campuses.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => campusLocations.id),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    imagePath: text("image_path"),
    pickupNotes: text("pickup_notes"),
    isAcceptingOrders: boolean("is_accepting_orders").notNull().default(true),
    isSampleData: boolean("is_sample_data").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("restaurants_slug_unique").on(t.slug),
    index("restaurants_campus_active_idx")
      .on(t.campusId)
      .where(sql`${t.deletedAt} is null`),
    check("restaurants_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const cuisines = pgTable(
  "cuisines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 40 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
  },
  (t) => [uniqueIndex("cuisines_slug_unique").on(t.slug)],
);

export const restaurantCuisines = pgTable(
  "restaurant_cuisines",
  {
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    cuisineId: uuid("cuisine_id")
      .notNull()
      .references(() => cuisines.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.restaurantId, t.cuisineId] })],
);

/** Weekly opening hours in the campus time zone. Minutes past midnight; > 1440 means after midnight. */
export const restaurantHours = pgTable(
  "restaurant_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    opensAtMinute: smallint("opens_at_minute").notNull(),
    closesAtMinute: smallint("closes_at_minute").notNull(),
  },
  (t) => [
    uniqueIndex("restaurant_hours_slot_unique").on(t.restaurantId, t.dayOfWeek, t.opensAtMinute),
    check("restaurant_hours_day_range", sql`${t.dayOfWeek} between 0 and 6`),
    check("restaurant_hours_opens_range", sql`${t.opensAtMinute} between 0 and 1439`),
    check(
      "restaurant_hours_closes_after_opens",
      sql`${t.closesAtMinute} > ${t.opensAtMinute} and ${t.closesAtMinute} <= 2880`,
    ),
  ],
);

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    name: varchar("name", { length: 60 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    // Target of the composite foreign key on menu_items.
    unique("menu_categories_id_restaurant_unique").on(t.id, t.restaurantId),
    uniqueIndex("menu_categories_name_unique")
      .on(t.restaurantId, t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    categoryId: uuid("category_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 300 }),
    priceCents: integer("price_cents").notNull(),
    imagePath: text("image_path"),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    // An item can only be filed under a category of its own restaurant.
    foreignKey({
      name: "menu_items_category_same_restaurant_fk",
      columns: [t.categoryId, t.restaurantId],
      foreignColumns: [menuCategories.id, menuCategories.restaurantId],
    }),
    // Targets of the composite foreign keys on cart_items and order_items.
    unique("menu_items_id_restaurant_unique").on(t.id, t.restaurantId),
    check("menu_items_price_nonneg", sql`${t.priceCents} >= 0`),
    index("menu_items_listing_idx")
      .on(t.restaurantId, t.categoryId, t.sortOrder)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const menuOptionGroups = pgTable(
  "menu_option_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id),
    name: varchar("name", { length: 60 }).notNull(),
    minSelect: smallint("min_select").notNull().default(0),
    maxSelect: smallint("max_select").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    check("menu_option_groups_min_nonneg", sql`${t.minSelect} >= 0`),
    check("menu_option_groups_max_valid", sql`${t.maxSelect} >= 1 and ${t.maxSelect} >= ${t.minSelect}`),
    index("menu_option_groups_item_idx").on(t.menuItemId),
  ],
);

export const menuOptions = pgTable(
  "menu_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    optionGroupId: uuid("option_group_id")
      .notNull()
      .references(() => menuOptionGroups.id),
    name: varchar("name", { length: 60 }).notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    check("menu_options_price_delta_nonneg", sql`${t.priceDeltaCents} >= 0`),
    index("menu_options_group_idx").on(t.optionGroupId),
  ],
);
