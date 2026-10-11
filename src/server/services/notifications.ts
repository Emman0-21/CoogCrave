import "server-only";

import { and, count, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";

import { type Database, type DbExecutor, getDb } from "@/server/db/client";
import type { DecidedCourierStatus } from "@/server/domain/admin-rules";
import { notifications, orders } from "@/server/db/schema";
import type { NotificationType } from "@/shared/enums";
import type { MarkReadInput, NotificationListView, NotificationsQuery } from "@/shared/schemas/engagement";

import { decodeCursor, encodeCursor, microsecondTimestamp } from "./pagination";

interface OrderNotice {
  userId: string;
  orderId: string;
  orderNumber: string;
  restaurantName: string;
}

const TEXT: Partial<Record<NotificationType, (n: OrderNotice) => { title: string; body: string }>> = {
  ORDER_PLACED: (n) => ({
    title: "Order placed",
    body: `${n.restaurantName} has your order ${n.orderNumber}. We'll update you as it moves along.`,
  }),
  ORDER_CONFIRMED: (n) => ({
    title: "Order confirmed",
    body: `${n.restaurantName} confirmed order ${n.orderNumber} and is preparing it.`,
  }),
  ORDER_READY: (n) => ({
    title: "Ready for pickup",
    body: `Order ${n.orderNumber} is ready. A student courier will pick it up next.`,
  }),
  COURIER_ASSIGNED: (n) => ({
    title: "Courier on the way",
    body: `A student courier is heading to ${n.restaurantName} for order ${n.orderNumber}.`,
  }),
  COURIER_RELEASED: (n) => ({
    title: "Finding another courier",
    body: `Your courier couldn't take order ${n.orderNumber}. It's back in line for the next courier.`,
  }),
  ORDER_PICKED_UP: (n) => ({
    title: "On its way",
    body: `Your courier picked up order ${n.orderNumber} and is heading to your building.`,
  }),
  ORDER_DELIVERED: (n) => ({
    title: "Delivered",
    body: `Order ${n.orderNumber} from ${n.restaurantName} was delivered. Enjoy!`,
  }),
  DELIVERY_FAILED: (n) => ({
    title: "Delivery didn't happen",
    body: `Your courier couldn't deliver order ${n.orderNumber}. No payment was taken.`,
  }),
  ORDER_CANCELLED: (n) => ({
    title: "Order cancelled",
    body: `Order ${n.orderNumber} from ${n.restaurantName} was cancelled. No payment was taken.`,
  }),
};

/**
 * Writes an in-app notification row (PRD NTF-1). Pass the transaction that changes the order, so the
 * notification exists only if the change commits (docs/ARCHITECTURE.md §10).
 */
export async function notifyOrder(
  db: DbExecutor,
  type: NotificationType,
  notice: OrderNotice,
): Promise<void> {
  const text = TEXT[type];
  if (!text) throw new Error(`No notification text for ${type}`);
  await db
    .insert(notifications)
    .values({ userId: notice.userId, orderId: notice.orderId, type, ...text(notice) });
}

/** What the courier is told when an admin steps into their delivery (T7, T9, T11 as ADMIN). */
const COURIER_TEXT: Partial<Record<NotificationType, (n: OrderNotice) => { title: string; body: string }>> = {
  COURIER_RELEASED: (n) => ({
    title: "Delivery reassigned",
    body: `An admin took order ${n.orderNumber} off your list. You don't need to pick it up.`,
  }),
  ORDER_CANCELLED: (n) => ({
    title: "Delivery cancelled",
    body: `Order ${n.orderNumber} was cancelled by an admin. You don't need to pick it up.`,
  }),
  DELIVERY_FAILED: (n) => ({
    title: "Delivery closed",
    body: `An admin closed order ${n.orderNumber} as not delivered. It no longer needs you.`,
  }),
};

export async function notifyCourierOfAdminAction(
  db: DbExecutor,
  type: NotificationType,
  notice: OrderNotice,
): Promise<void> {
  const text = COURIER_TEXT[type];
  if (!text) throw new Error(`No courier notification text for ${type}`);
  await db
    .insert(notifications)
    .values({ userId: notice.userId, orderId: notice.orderId, type, ...text(notice) });
}

const DECISION_TEXT: Record<DecidedCourierStatus, { title: string; body: string }> = {
  APPROVED: {
    title: "You're approved to deliver",
    body: "Open Deliver and go online to see orders ready for pickup.",
  },
  REJECTED: {
    title: "Courier application not approved",
    body: "Your application wasn't approved this time. You can read the note and apply again from Deliver.",
  },
  SUSPENDED: {
    title: "Courier access paused",
    body: "An admin paused your courier access, so you won't see deliveries for now.",
  },
};

/** Tells an applicant or courier about an admin decision on their courier profile (PRD NTF-1). */
export async function notifyCourierDecision(
  db: DbExecutor,
  userId: string,
  outcome: DecidedCourierStatus,
): Promise<void> {
  await db
    .insert(notifications)
    .values({ userId, type: "COURIER_APPLICATION_DECIDED", ...DECISION_TEXT[outcome] });
}

// ── Reading (PRD NTF-2) ──────────────────────────────────────────────────────

/**
 * Where a notification leads. Order notices go to the customer's order page; the same notice sent to a
 * courier (an admin took their delivery) goes to their delivery history, since the customer page isn't
 * theirs to open; courier decisions go to the courier page.
 */
export function notificationHref(
  type: NotificationType,
  orderId: string | null,
  isOwnOrder: boolean,
): string | null {
  if (type === "COURIER_APPLICATION_DECIDED") return "/courier";
  if (!orderId) return null;
  return isOwnOrder ? `/orders/${orderId}` : "/courier/history";
}

/** How many unread notifications the user has (header badge). */
export async function unreadNotificationCount(userId: string, db: DbExecutor = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** GET /api/v1/notifications: the caller's own notifications, newest first, a page at a time. */
export async function listNotifications(
  userId: string,
  query: NotificationsQuery,
  db: Database = getDb(),
): Promise<NotificationListView> {
  const filters: SQL[] = [eq(notifications.userId, userId)];
  if (query.unreadOnly === "true") filters.push(isNull(notifications.readAt));
  if (query.cursor) {
    const { timestamp, id } = decodeCursor(query.cursor);
    filters.push(
      sql`(${notifications.createdAt}, ${notifications.id}) < (${timestamp}::timestamptz, ${id}::uuid)`,
    );
  }
  const [rows, unread] = await Promise.all([
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        orderId: notifications.orderId,
        orderCustomerId: orders.customerId,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        cursorTs: microsecondTimestamp(notifications.createdAt),
      })
      .from(notifications)
      .leftJoin(orders, eq(orders.id, notifications.orderId))
      .where(and(...filters))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(query.limit + 1),
    unreadNotificationCount(userId, db),
  ]);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    data: page.map(({ cursorTs: _cursor, orderCustomerId, readAt, createdAt, ...row }) => ({
      ...row,
      href: notificationHref(row.type, row.orderId, orderCustomerId === userId),
      readAt: readAt?.toISOString() ?? null,
      createdAt: createdAt.toISOString(),
    })),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.cursorTs, last.id) : null,
    unreadCount: unread,
  };
}

/**
 * POST /api/v1/notifications/mark-read. Only ever touches the caller's own rows: IDs that belong to
 * someone else (or don't exist) are ignored, so the response can't be used to probe for them.
 * Already-read rows keep their original read time.
 */
export async function markNotificationsRead(
  userId: string,
  input: MarkReadInput,
  db: Database = getDb(),
): Promise<void> {
  const which = "ids" in input ? inArray(notifications.id, input.ids) : undefined;
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), which));
}
