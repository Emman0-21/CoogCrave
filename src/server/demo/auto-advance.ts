import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";

import { type AppConfig, getConfig } from "@/server/config";
import { type Database, getDb } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import type { Logger } from "pino";
import { transitionOrder } from "@/server/services/order-workflow";
import type { OrderStatus } from "@/shared/enums";

/**
 * Demo auto-advance (PRD Q3, DEVELOPMENT_PLAN D4): for rehearsals, the simulated restaurant confirms
 * each new order and marks it ready, STEP_SECONDS apart, so one person can practice the courier side.
 * Off unless DEMO_AUTO_ADVANCE=true, and the config refuses it in production.
 *
 * It goes through the same referee as the Kitchen Console (compare-and-set on status and version), so
 * an admin, a customer cancelling, or a second server instance racing it can't cause a double move: the
 * loser gets STALE_STATE and is skipped. Status events record actor type RESTAURANT_SIM with no user,
 * which is how an automatic step is told apart from an admin's.
 */

export const STEP_SECONDS = 15;
const BATCH = 20;

/** Later step first, so an order confirmed in this pass waits its full step before becoming ready. */
const STEPS: [OrderStatus, OrderStatus][] = [
  ["CONFIRMED", "READY_FOR_PICKUP"],
  ["PLACED", "CONFIRMED"],
];

export function autoAdvanceEnabled(config: Pick<AppConfig, "APP_ENV" | "DEMO_AUTO_ADVANCE"> = getConfig()) {
  return config.APP_ENV !== "production" && config.DEMO_AUTO_ADVANCE;
}

/** One pass: moves every order that has waited STEP_SECONDS at PLACED or CONFIRMED one step on. */
export async function advanceDemoOrders(
  db: Database = getDb(),
  now: Date = new Date(),
): Promise<{ advanced: number; skipped: number }> {
  const cutoff = new Date(now.getTime() - STEP_SECONDS * 1000);
  let advanced = 0;
  let skipped = 0;
  for (const [from, to] of STEPS) {
    const due = await db
      .select({ id: orders.id, version: orders.version })
      .from(orders)
      .where(
        and(eq(orders.status, from), lte(orders.statusUpdatedAt, sql`${cutoff.toISOString()}::timestamptz`)),
      )
      .orderBy(asc(orders.statusUpdatedAt))
      .limit(BATCH);
    for (const order of due) {
      try {
        await transitionOrder(db, {
          orderId: order.id,
          toStatus: to,
          actorType: "RESTAURANT_SIM",
          actorUserId: null,
          expectedVersion: order.version,
        });
        advanced++;
      } catch (error) {
        // Someone else moved it first (Kitchen Console, a cancel, another instance): nothing to do.
        if (
          error instanceof AppError &&
          (error.code === "STALE_STATE" || error.code === "INVALID_TRANSITION")
        ) {
          skipped++;
          continue;
        }
        throw error;
      }
    }
  }
  return { advanced, skipped };
}

/**
 * Runs a pass every few seconds in this server process. Returns a stop function. One pass at a time;
 * a failing pass is logged and the next one tries again. The timer doesn't keep the process alive.
 */
export function startAutoAdvance(
  log: Pick<Logger, "info" | "error">,
  intervalMs = 5_000,
  pass: () => Promise<{ advanced: number; skipped: number }> = () => advanceDemoOrders(),
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    pass()
      .then((result) => {
        if (result.advanced > 0) log.info({ ...result }, "demo auto-advance moved orders");
      })
      .catch((error: unknown) => log.error({ err: error }, "demo auto-advance pass failed"))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  log.info({ stepSeconds: STEP_SECONDS }, "demo auto-advance is on (rehearsal mode)");
  return () => clearInterval(timer);
}
