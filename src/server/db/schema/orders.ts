import { sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { campuses, campusLocations } from "./campus";
import { menuItems, menuOptions, restaurants } from "./catalog";
import { timestamps, tz } from "./columns";
import { actorType, orderStatus, paymentProvider, paymentStatus } from "./enums";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 16 }).notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    campusId: uuid("campus_id")
      .notNull()
      .references(() => campuses.id),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    restaurantNameSnapshot: varchar("restaurant_name_snapshot", { length: 80 }).notNull(),
    deliveryLocationId: uuid("delivery_location_id")
      .notNull()
      .references(() => campusLocations.id),
    deliveryLocationSnapshot: varchar("delivery_location_snapshot", { length: 120 }).notNull(),
    // Personal data: redacted 30 days after a terminal status (docs/PRODUCT_REQUIREMENTS.md §8).
    deliveryInstructions: varchar("delivery_instructions", { length: 280 }),
    status: orderStatus("status").notNull().default("PLACED"),
    statusUpdatedAt: tz("status_updated_at").notNull().defaultNow(),
    subtotalCents: integer("subtotal_cents").notNull(),
    deliveryFeeCents: integer("delivery_fee_cents").notNull(),
    serviceFeeCents: integer("service_fee_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    tipCents: integer("tip_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    // Incremented on every status change; lets clients detect stale state.
    version: integer("version").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_order_number_unique").on(t.orderNumber),
    // Duplicate-submit protection (docs/ARCHITECTURE.md §7.2).
    uniqueIndex("orders_customer_idempotency_unique").on(t.customerId, t.idempotencyKey),
    // Target of the composite foreign key on order_items.
    unique("orders_id_restaurant_unique").on(t.id, t.restaurantId),
    check("orders_order_number_format", sql`${t.orderNumber} ~ '^CC-[0-9A-Z]{5,12}$'`),
    check(
      "orders_amounts_nonneg",
      sql`${t.subtotalCents} >= 0 and ${t.deliveryFeeCents} >= 0 and ${t.serviceFeeCents} >= 0 and ${t.taxCents} >= 0 and ${t.tipCents} >= 0`,
    ),
    check(
      "orders_total_is_sum",
      sql`${t.totalCents} = ${t.subtotalCents} + ${t.deliveryFeeCents} + ${t.serviceFeeCents} + ${t.taxCents} + ${t.tipCents}`,
    ),
    check("orders_currency_usd", sql`${t.currency} = 'USD'`),
    check("orders_version_nonneg", sql`${t.version} >= 0`),
    index("orders_customer_history_idx").on(t.customerId, t.createdAt.desc()),
    index("orders_ready_offers_idx")
      .on(t.statusUpdatedAt)
      .where(sql`${t.status} = 'READY_FOR_PICKUP'`),
    index("orders_status_created_idx").on(t.status, t.createdAt.desc()),
    index("orders_restaurant_created_idx").on(t.restaurantId, t.createdAt.desc()),
  ],
);

/** What was bought, frozen at purchase time so later menu edits never change history. */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    restaurantId: uuid("restaurant_id").notNull(),
    menuItemId: uuid("menu_item_id").notNull(),
    nameSnapshot: varchar("name_snapshot", { length: 80 }).notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    optionsTotalCents: integer("options_total_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    specialInstructions: varchar("special_instructions", { length: 140 }),
  },
  (t) => [
    foreignKey({
      name: "order_items_order_fk",
      columns: [t.orderId, t.restaurantId],
      foreignColumns: [orders.id, orders.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      name: "order_items_item_same_restaurant_fk",
      columns: [t.menuItemId, t.restaurantId],
      foreignColumns: [menuItems.id, menuItems.restaurantId],
    }),
    check("order_items_prices_nonneg", sql`${t.unitPriceCents} >= 0 and ${t.optionsTotalCents} >= 0`),
    check("order_items_quantity_range", sql`${t.quantity} between 1 and 20`),
    check(
      "order_items_line_total",
      sql`${t.lineTotalCents} = (${t.unitPriceCents} + ${t.optionsTotalCents}) * ${t.quantity}`,
    ),
    index("order_items_order_idx").on(t.orderId),
  ],
);

export const orderItemOptions = pgTable(
  "order_item_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    menuOptionId: uuid("menu_option_id")
      .notNull()
      .references(() => menuOptions.id),
    groupNameSnapshot: varchar("group_name_snapshot", { length: 60 }).notNull(),
    optionNameSnapshot: varchar("option_name_snapshot", { length: 60 }).notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull(),
  },
  (t) => [
    check("order_item_options_price_nonneg", sql`${t.priceDeltaCents} >= 0`),
    index("order_item_options_item_idx").on(t.orderItemId),
  ],
);

/**
 * Append-only status history; the tracking timeline reads it. The app role may only insert and read
 * (see the grants migration). Rows go away only when their order is deleted (demo reset).
 */
export const orderStatusEvents = pgTable(
  "order_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    actorType: actorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    reason: varchar("reason", { length: 300 }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("order_status_events_order_idx").on(t.orderId, t.createdAt),
    check(
      "order_status_events_actor_user",
      sql`${t.actorType} in ('SYSTEM', 'RESTAURANT_SIM') or ${t.actorUserId} is not null`,
    ),
  ],
);

/** Simulated payment record (provider DEMO). Same shape a real processor's authorize/capture/void would use. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: paymentProvider("provider").notNull(),
    status: paymentStatus("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    providerReference: text("provider_reference").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_order_unique").on(t.orderId),
    check("payments_amount_nonneg", sql`${t.amountCents} >= 0`),
  ],
);
