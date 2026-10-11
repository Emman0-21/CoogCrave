import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { menuItems, menuOptions, restaurants } from "./catalog";
import { timestamps, tz } from "./columns";

/** Server-side cart: one per user, one restaurant per cart. Stores no prices; they're computed on read. */
export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("carts_user_unique").on(t.userId),
    unique("carts_id_restaurant_unique").on(t.id, t.restaurantId),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id").notNull(),
    // Duplicated from the cart so the two composite keys below can prove the item is from the cart's restaurant.
    restaurantId: uuid("restaurant_id").notNull(),
    menuItemId: uuid("menu_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    specialInstructions: varchar("special_instructions", { length: 140 }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "cart_items_cart_fk",
      columns: [t.cartId, t.restaurantId],
      foreignColumns: [carts.id, carts.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      name: "cart_items_item_same_restaurant_fk",
      columns: [t.menuItemId, t.restaurantId],
      foreignColumns: [menuItems.id, menuItems.restaurantId],
    }),
    check("cart_items_quantity_range", sql`${t.quantity} between 1 and 20`),
    index("cart_items_cart_idx").on(t.cartId),
  ],
);

export const cartItemOptions = pgTable(
  "cart_item_options",
  {
    cartItemId: uuid("cart_item_id")
      .notNull()
      .references(() => cartItems.id, { onDelete: "cascade" }),
    menuOptionId: uuid("menu_option_id")
      .notNull()
      .references(() => menuOptions.id),
  },
  (t) => [primaryKey({ columns: [t.cartItemId, t.menuOptionId] })],
);
