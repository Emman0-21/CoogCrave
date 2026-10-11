import "server-only";

import type { DbExecutor } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import type { NotificationType } from "@/shared/enums";

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
