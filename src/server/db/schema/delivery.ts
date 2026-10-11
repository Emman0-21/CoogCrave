import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { tz } from "./columns";
import { assignmentEndReason } from "./enums";
import { orders } from "./orders";
import { courierProfiles } from "./profiles";

/**
 * Courier ↔ order assignments. A row with ended_at = NULL is the active assignment.
 * Ended rows stay, so releases and reassignments keep their history.
 */
export const deliveryAssignments = pgTable(
  "delivery_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    courierId: uuid("courier_id")
      .notNull()
      .references(() => courierProfiles.id),
    assignedAt: tz("assigned_at").notNull().defaultNow(),
    pickedUpAt: tz("picked_up_at"),
    endedAt: tz("ended_at"),
    endReason: assignmentEndReason("end_reason"),
    // Simulated earnings, fixed at delivery.
    payoutCents: integer("payout_cents"),
  },
  (t) => [
    // Concurrency backstops (docs/ARCHITECTURE.md §7.1): one active courier per order,
    // one active order per courier, no matter what the application code does.
    uniqueIndex("delivery_assignments_one_active_per_order")
      .on(t.orderId)
      .where(sql`${t.endedAt} is null`),
    uniqueIndex("delivery_assignments_one_active_per_courier")
      .on(t.courierId)
      .where(sql`${t.endedAt} is null`),
    check("delivery_assignments_end_consistent", sql`(${t.endedAt} is null) = (${t.endReason} is null)`),
    check(
      "delivery_assignments_payout_only_when_delivered",
      sql`${t.payoutCents} is null or (${t.endReason} = 'DELIVERED' and ${t.payoutCents} >= 0)`,
    ),
    index("delivery_assignments_courier_history_idx").on(t.courierId, t.assignedAt.desc()),
  ],
);

/** Offers a courier declined; hidden from that courier only. */
export const deliveryOfferDeclines = pgTable(
  "delivery_offer_declines",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    courierId: uuid("courier_id")
      .notNull()
      .references(() => courierProfiles.id),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.courierId] })],
);
