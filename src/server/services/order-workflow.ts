import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database, Transaction } from "@/server/db/client";
import { uniqueViolationConstraint } from "@/server/db/pg-errors";
import {
  deliveryAssignments,
  deliveryOfferDeclines,
  orders,
  orderStatusEvents,
  payments,
} from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { acceptRefusal, payoutFor } from "@/server/domain/delivery";
import { checkTransition, TERMINAL_STATUSES, type TransitionRule } from "@/server/domain/order-state-machine";
import { AppError } from "@/server/http/errors";
import { getPaymentGateway, type PaymentGateway } from "@/server/payments/gateway";
import type { ActorType, AssignmentEndReason, NotificationType, OrderStatus } from "@/shared/enums";

import { recordAudit } from "./audit";
import { notifyOrder } from "./notifications";

/**
 * The single referee for every order status change (docs/ARCHITECTURE.md §6–7). Callers work out who
 * the actor is from their relationship to the order; this module checks the move against the state
 * machine, applies it with compare-and-set, and performs every side effect of that move in the same
 * transaction: history, delivery assignments, simulated payout and payment, notifications, and audit.
 *
 * The analogy: a referee with a rulebook (the pure state machine) and a scoresheet (the database).
 * Whoever blows the whistle, the referee checks the rulebook, then writes one line on the scoresheet;
 * two players can't both score the same point because the scoresheet line is written compare-and-set.
 */

const NOT_FOUND = () => new AppError("NOT_FOUND", "We couldn't find that order.");

const ACCEPT_MESSAGES = {
  COURIER_NOT_APPROVED: "This needs an approved courier account.",
  COURIER_OFFLINE: "Go online to take deliveries.",
  CANNOT_ACCEPT_OWN_ORDER: "You can't deliver your own order.",
  COURIER_HAS_ACTIVE_DELIVERY: "Finish your current delivery before taking another.",
  OFFER_UNAVAILABLE: "Another courier just took this delivery.",
} as const;

export interface TransitionRequest {
  orderId: string;
  toStatus: OrderStatus;
  actorType: ActorType;
  /** The user behind the action; null only for automated RESTAURANT_SIM / SYSTEM changes. */
  actorUserId: string | null;
  /** Required when actorType is COURIER: the courier acting, as read from the database this request. */
  courier?: NonNullable<Actor["courier"]>;
  reason?: string | null;
  expectedVersion?: number;
  /** When an admin acts (including as the simulated restaurant), the audit record to write. */
  audit?: { actor: Actor; requestId?: string };
}

export interface TransitionResult {
  /** False when a courier re-sent an accept for an order they already hold (idempotent replay). */
  changed: boolean;
  status: OrderStatus;
}

const END_REASON: Partial<Record<TransitionRule["id"], AssignmentEndReason>> = {
  T9: "ORDER_CANCELLED",
  T10: "DELIVERED",
  T11: "DELIVERY_FAILED",
};

/** Which notification the customer gets for a rule (T7 returns an order to the queue: "finding another courier"). */
const CUSTOMER_NOTICE: Partial<Record<TransitionRule["id"], NotificationType>> = {
  T1: "ORDER_CONFIRMED",
  T2: "ORDER_CANCELLED",
  T3: "ORDER_READY",
  T4: "ORDER_CANCELLED",
  T5: "COURIER_ASSIGNED",
  T6: "ORDER_CANCELLED",
  T7: "COURIER_RELEASED",
  T8: "ORDER_PICKED_UP",
  T9: "ORDER_CANCELLED",
  T10: "ORDER_DELIVERED",
  T11: "DELIVERY_FAILED",
};

type PaymentFollowUp = { action: "capture" | "void"; reference: string };

async function activeAssignment(tx: Transaction, orderId: string) {
  const [row] = await tx
    .select({ id: deliveryAssignments.id, courierId: deliveryAssignments.courierId })
    .from(deliveryAssignments)
    .where(and(eq(deliveryAssignments.orderId, orderId), isNull(deliveryAssignments.endedAt)));
  return row ?? null;
}

async function courierIsBusy(tx: Transaction, courierId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: deliveryAssignments.id })
    .from(deliveryAssignments)
    .where(and(eq(deliveryAssignments.courierId, courierId), isNull(deliveryAssignments.endedAt)));
  return Boolean(row);
}

/** Moves the simulated payment and returns what to tell the processor after commit. */
async function settlePayment(
  tx: Transaction,
  orderId: string,
  to: "CAPTURED" | "VOIDED",
): Promise<PaymentFollowUp[]> {
  const rows = await tx
    .update(payments)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "AUTHORIZED")))
    .returning({ reference: payments.providerReference });
  return rows.map((r) => ({ action: to === "CAPTURED" ? "capture" : "void", reference: r.reference }));
}

/** Ends the order's active assignment. Statuses ASSIGNED and PICKED_UP always have exactly one. */
async function endAssignment(
  tx: Transaction,
  orderId: string,
  reason: AssignmentEndReason,
  payoutCents: number | null = null,
): Promise<void> {
  const ended = await tx
    .update(deliveryAssignments)
    .set({ endedAt: sql`now()`, endReason: reason, payoutCents })
    .where(and(eq(deliveryAssignments.orderId, orderId), isNull(deliveryAssignments.endedAt)))
    .returning({ id: deliveryAssignments.id, courierId: deliveryAssignments.courierId });
  if (ended.length !== 1) throw new Error(`order ${orderId} had ${ended.length} active assignments`);
}

export async function transitionOrder(
  db: Database,
  request: TransitionRequest,
  gateway: PaymentGateway = getPaymentGateway(),
): Promise<TransitionResult> {
  const { result, followUps } = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: orders.id,
        status: orders.status,
        version: orders.version,
        customerId: orders.customerId,
        orderNumber: orders.orderNumber,
        restaurantName: orders.restaurantNameSnapshot,
        deliveryFeeCents: orders.deliveryFeeCents,
        tipCents: orders.tipCents,
      })
      .from(orders)
      .where(eq(orders.id, request.orderId));
    if (!current) throw NOT_FOUND();

    const isCourier = request.actorType === "COURIER";
    if (isCourier && !request.courier) throw new Error("COURIER transitions need the acting courier");
    const assignment = await activeAssignment(tx, current.id);

    if (isCourier && request.toStatus === "ASSIGNED") {
      // Re-sending an accept for an order this courier already holds changes nothing (API_SPEC §7).
      if (assignment?.courierId === request.courier!.id) {
        return { result: { changed: false, status: current.status }, followUps: [] };
      }
      const refusal = acceptRefusal(
        { ...request.courier!, hasActiveDelivery: await courierIsBusy(tx, request.courier!.id) },
        request.actorUserId ?? "",
        current,
      );
      if (refusal) throw new AppError(refusal, ACCEPT_MESSAGES[refusal]);
    } else if (isCourier && assignment?.courierId !== request.courier!.id) {
      // Only the assigned courier may move a delivery along; to anyone else it isn't there.
      throw NOT_FOUND();
    }

    const decision = checkTransition(current.status, request.toStatus, request.actorType, request.reason);
    if (!decision.allowed) {
      throw decision.code === "REASON_REQUIRED"
        ? new AppError("REASON_REQUIRED", "Give a reason for this change.")
        : new AppError("INVALID_TRANSITION", transitionRefusal(current.status, request.toStatus), {
            currentStatus: current.status,
          });
    }
    const rule = decision.rule;
    if (request.expectedVersion !== undefined && request.expectedVersion !== current.version) {
      throw staleState(current.status);
    }

    // Compare-and-set: succeeds only if nobody changed the order since it was read above. For two couriers
    // accepting at once, the second one waits on the row lock, then matches zero rows here.
    const updated = await tx
      .update(orders)
      .set({
        status: request.toStatus,
        statusUpdatedAt: sql`now()`,
        version: sql`${orders.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, current.id),
          eq(orders.status, current.status),
          eq(orders.version, current.version),
        ),
      )
      .returning({ id: orders.id });
    if (updated.length === 0) {
      if (rule.id === "T5") throw new AppError("OFFER_UNAVAILABLE", ACCEPT_MESSAGES.OFFER_UNAVAILABLE);
      throw staleState(current.status);
    }

    const followUps: PaymentFollowUp[] = [];
    switch (rule.id) {
      case "T5":
        try {
          // A savepoint, so a unique violation can be translated into an API error cleanly.
          await tx.transaction(async (sp) => {
            await sp
              .insert(deliveryAssignments)
              .values({ orderId: current.id, courierId: request.courier!.id });
          });
        } catch (error) {
          // The partial unique indexes are the last line of defense (ARCHITECTURE §7.1).
          const constraint = uniqueViolationConstraint(error);
          if (constraint === "delivery_assignments_one_active_per_courier") {
            throw new AppError("COURIER_HAS_ACTIVE_DELIVERY", ACCEPT_MESSAGES.COURIER_HAS_ACTIVE_DELIVERY);
          }
          if (constraint === "delivery_assignments_one_active_per_order") {
            throw new AppError("OFFER_UNAVAILABLE", ACCEPT_MESSAGES.OFFER_UNAVAILABLE);
          }
          throw error;
        }
        break;
      case "T7": {
        const releasedBy = assignment!.courierId;
        await endAssignment(
          tx,
          current.id,
          request.actorType === "COURIER" ? "RELEASED_BY_COURIER" : "UNASSIGNED_BY_ADMIN",
        );
        // The courier who gave it up doesn't see it again as an offer.
        await tx
          .insert(deliveryOfferDeclines)
          .values({ orderId: current.id, courierId: releasedBy })
          .onConflictDoNothing();
        break;
      }
      case "T8":
        await tx
          .update(deliveryAssignments)
          .set({ pickedUpAt: sql`now()` })
          .where(and(eq(deliveryAssignments.orderId, current.id), isNull(deliveryAssignments.endedAt)));
        break;
      case "T10":
        await endAssignment(tx, current.id, "DELIVERED", payoutFor(current));
        followUps.push(...(await settlePayment(tx, current.id, "CAPTURED")));
        break;
      case "T9":
      case "T11":
        await endAssignment(tx, current.id, END_REASON[rule.id]!);
        followUps.push(...(await settlePayment(tx, current.id, "VOIDED")));
        break;
      case "T2":
      case "T4":
      case "T6":
        followUps.push(...(await settlePayment(tx, current.id, "VOIDED")));
        break;
      // T1 and T3 change only the status.
    }

    await tx.insert(orderStatusEvents).values({
      orderId: current.id,
      fromStatus: current.status,
      toStatus: request.toStatus,
      actorType: request.actorType,
      actorUserId: request.actorUserId,
      reason: request.reason?.trim() || null,
    });

    const notice = CUSTOMER_NOTICE[rule.id];
    if (notice) {
      await notifyOrder(tx, notice, {
        userId: current.customerId,
        orderId: current.id,
        orderNumber: current.orderNumber,
        restaurantName: current.restaurantName,
      });
    }

    if (request.audit) {
      await recordAudit(tx, {
        by: { kind: "ADMIN", actor: request.audit.actor },
        action:
          request.actorType === "RESTAURANT_SIM"
            ? `order.kitchen_${request.toStatus.toLowerCase()}`
            : `order.admin_${request.toStatus.toLowerCase()}`,
        targetType: "order",
        targetId: current.id,
        metadata: {
          orderNumber: current.orderNumber,
          from: current.status,
          to: request.toStatus,
          actingAs: request.actorType,
          ...(request.reason?.trim() ? { reason: request.reason.trim() } : {}),
        },
        requestId: request.audit.requestId,
      });
    }

    return { result: { changed: true, status: request.toStatus }, followUps };
  });

  // Tell the processor only after the change has committed, so a rolled-back change never moves money.
  // (The demo gateway can't fail; a real processor would need a retry queue here.)
  for (const f of followUps)
    await (f.action === "capture" ? gateway.capture(f.reference) : gateway.void(f.reference));
  return result;
}

function staleState(status: OrderStatus): AppError {
  return new AppError("STALE_STATE", "This order just changed. Refresh to see its latest status.", {
    currentStatus: status,
  });
}

function transitionRefusal(from: OrderStatus, to: OrderStatus): string {
  if (to === "CANCELLED" && from !== "PLACED") {
    return "The restaurant has already started on this order, so it can't be cancelled here.";
  }
  if (TERMINAL_STATUSES.includes(from)) return "This order is already finished.";
  return "That change isn't possible for this order right now.";
}
