import "server-only";

import { and, eq } from "drizzle-orm";

import { type Database, type DbExecutor, getDb } from "@/server/db/client";
import { uniqueViolationConstraint } from "@/server/db/pg-errors";
import { deliveryAssignments, orders, reviews } from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { AppError } from "@/server/http/errors";
import type { ReviewInput, ReviewView } from "@/shared/schemas/engagement";

/**
 * Reviews (PRD REV-1, REV-2, THREAT_MODEL T-13): the customer rates a delivered order once. The rating
 * belongs to the courier who delivered it, so it counts toward their average.
 */

const NOT_FOUND = () => new AppError("NOT_FOUND", "We couldn't find that order.");
const ALREADY_REVIEWED = () => new AppError("ALREADY_REVIEWED", "You've already rated this delivery.");

function toView(row: typeof reviews.$inferSelect): ReviewView {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The review of an order, if there is one (used by every order projection). */
export async function loadReview(db: DbExecutor, orderId: string): Promise<ReviewView | null> {
  const [row] = await db.select().from(reviews).where(eq(reviews.orderId, orderId));
  return row ? toView(row) : null;
}

/** POST /api/v1/orders/{orderId}/review. 404 unless it's the caller's order; one review per order. */
export async function createReview(
  actor: Actor,
  orderId: string,
  input: ReviewInput,
  db: Database = getDb(),
): Promise<ReviewView> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, actor.userId)));
    if (!order) throw NOT_FOUND();
    if (order.status !== "DELIVERED") {
      throw new AppError("NOT_REVIEWABLE", "You can rate a delivery once it's been delivered.", {
        currentStatus: order.status,
      });
    }
    const [delivered] = await tx
      .select({ courierId: deliveryAssignments.courierId })
      .from(deliveryAssignments)
      .where(and(eq(deliveryAssignments.orderId, order.id), eq(deliveryAssignments.endReason, "DELIVERED")));
    // A delivered order always has the assignment that delivered it (order-workflow.ts, T10).
    if (!delivered) throw new Error(`delivered order ${order.id} has no delivering assignment`);

    try {
      // A savepoint, so a duplicate (double submit) becomes a clean 409 instead of an aborted transaction.
      const [row] = await tx.transaction((sp) =>
        sp
          .insert(reviews)
          .values({
            orderId: order.id,
            customerId: actor.userId,
            courierId: delivered.courierId,
            rating: input.rating,
            comment: input.comment ?? null,
          })
          .returning(),
      );
      return toView(row!);
    } catch (error) {
      if (uniqueViolationConstraint(error) === "reviews_order_unique") throw ALREADY_REVIEWED();
      throw error;
    }
  });
}
