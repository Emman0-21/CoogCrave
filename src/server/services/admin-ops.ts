import "server-only";

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { type AppConfig, getConfig } from "@/server/config";
import { type Database, getDb } from "@/server/db/client";
import {
  campuses,
  carts,
  courierProfiles,
  deliveryAssignments,
  deliveryOfferDeclines,
  notifications,
  orders,
  payments,
  users,
} from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { AppError } from "@/server/http/errors";
import { seedCatalog } from "@/server/seed/catalog";
import { DEMO_ACCOUNTS, restoreDemoProfiles } from "@/server/seed/demo";
import type { AdminMetricsView, DemoResetView } from "@/shared/schemas/admin";
import { ORDER_STATUSES, type OrderStatus } from "@/shared/enums";

import { recordAudit } from "./audit";

/** Admin dashboard numbers and demo tooling (PRD ADM-1, ADM-10). */

/**
 * GET /api/v1/admin/metrics (PRD ADM-1). "Today" is the campus calendar day. GMV counts simulated
 * payments captured today, i.e. delivered orders; nobody is actually charged.
 */
export async function getMetrics(db: Database = getDb()): Promise<AdminMetricsView> {
  const localDate = (column: unknown) => sql`(${column} at time zone ${campuses.timezone})::date`;
  const today = sql`(now() at time zone ${campuses.timezone})::date`;

  const [byStatus, [couriers], [active], [gmv]] = await Promise.all([
    db
      .select({ status: orders.status, n: count() })
      .from(orders)
      .innerJoin(campuses, eq(campuses.id, orders.campusId))
      .where(sql`${localDate(orders.createdAt)} = ${today}`)
      .groupBy(orders.status),
    db
      .select({
        online: sql<number>`count(*) filter (where ${courierProfiles.isOnline})::int`,
        pending: sql<number>`count(*) filter (where ${courierProfiles.status} = 'PENDING')::int`,
      })
      .from(courierProfiles),
    db.select({ n: count() }).from(deliveryAssignments).where(isNull(deliveryAssignments.endedAt)),
    db
      .select({ cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .innerJoin(campuses, eq(campuses.id, orders.campusId))
      .where(and(eq(payments.status, "CAPTURED"), sql`${localDate(payments.updatedAt)} = ${today}`)),
  ]);

  const ordersToday = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const row of byStatus) ordersToday[row.status] = row.n;
  return {
    ordersToday,
    onlineCouriers: couriers?.online ?? 0,
    pendingApplications: couriers?.pending ?? 0,
    activeDeliveries: active?.n ?? 0,
    simulatedGmvTodayCents: gmv?.cents ?? 0,
  };
}

/** Demo reset exists only outside production and only when switched on (THREAT_MODEL T-29). */
export function demoResetAvailable(config: Pick<AppConfig, "APP_ENV" | "DEMO_RESET_ENABLED"> = getConfig()) {
  return config.APP_ENV !== "production" && config.DEMO_RESET_ENABLED;
}

/**
 * POST /api/v1/admin/demo/reset (PRD ADM-10). In one transaction: deletes every order the demo accounts
 * placed (with its items, history, assignments, payment, and notifications, by cascade), their carts,
 * notifications, and declined offers; puts the demo accounts' profiles back to their starting state;
 * restores the sample catalog; and records who did it. Never touches anyone else's data, and leaves
 * passwords and the audit log alone.
 *
 * Deliveries a demo courier made for non-demo customers stay, since they're part of someone else's history.
 */
export async function resetDemo(
  admin: Actor,
  requestId?: string,
  db: Database = getDb(),
  config: Pick<AppConfig, "APP_ENV" | "DEMO_RESET_ENABLED"> = getConfig(),
): Promise<DemoResetView> {
  if (!demoResetAvailable(config)) throw new AppError("NOT_FOUND", "Resource not found.");

  return db.transaction(async (tx) => {
    const demoUsers = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        inArray(
          users.email,
          DEMO_ACCOUNTS.map((a) => a.email),
        ),
      );
    const ids = demoUsers.map((u) => u.id);
    const empty = { orders: 0, carts: 0, notifications: 0 };

    const removed = ids.length
      ? {
          orders: (
            await tx.delete(orders).where(inArray(orders.customerId, ids)).returning({ id: orders.id })
          ).length,
          carts: (await tx.delete(carts).where(inArray(carts.userId, ids)).returning({ id: carts.id }))
            .length,
          notifications: (
            await tx
              .delete(notifications)
              .where(inArray(notifications.userId, ids))
              .returning({ id: notifications.id })
          ).length,
        }
      : empty;

    if (ids.length) {
      // A demo courier carrying someone else's order would be left holding it with a reset profile
      // (the applicant goes back to PENDING and couldn't finish it). Refuse, and roll back the deletes.
      const [busy] = await tx
        .select({ id: deliveryAssignments.id })
        .from(deliveryAssignments)
        .innerJoin(courierProfiles, eq(courierProfiles.id, deliveryAssignments.courierId))
        .where(and(inArray(courierProfiles.userId, ids), isNull(deliveryAssignments.endedAt)));
      if (busy) {
        throw new AppError(
          "ACTIVE_DELIVERY_IN_PROGRESS",
          "A demo courier is delivering someone else's order. Finish or unassign it, then reset.",
        );
      }
      const demoCouriers = tx
        .select({ id: courierProfiles.id })
        .from(courierProfiles)
        .where(inArray(courierProfiles.userId, ids));
      await tx.delete(deliveryOfferDeclines).where(inArray(deliveryOfferDeclines.courierId, demoCouriers));
      await tx.update(users).set({ suspendedAt: null, updatedAt: new Date() }).where(inArray(users.id, ids));
    }
    for (const user of demoUsers) {
      const account = DEMO_ACCOUNTS.find((a) => a.email === user.email)!;
      await restoreDemoProfiles(tx, account, user.id);
    }

    const catalog = await seedCatalog(tx);
    const resetAt = new Date().toISOString();
    await recordAudit(tx, {
      by: { kind: "ADMIN", actor: admin },
      action: "demo.reset",
      targetType: "demo",
      targetId: "demo",
      metadata: { removed, accountsRestored: demoUsers.length, restaurants: catalog.restaurants },
      requestId,
    });
    return {
      resetAt,
      removed,
      fixtures: { restaurants: catalog.restaurants, accounts: demoUsers.length },
    };
  });
}
