import type { OrderStatus } from "@/shared/enums";

/** Customer-facing names for each status, written from the customer's point of view. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  CONFIRMED: "Restaurant confirmed",
  READY_FOR_PICKUP: "Ready at the counter",
  ASSIGNED: "Courier heading to the restaurant",
  PICKED_UP: "On its way to you",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  DELIVERY_FAILED: "Delivery didn't happen",
};

/** One sentence about what happens next, for the tracking page headline. */
export const STATUS_NEXT: Record<OrderStatus, string> = {
  PLACED: "Waiting for the restaurant to confirm your order.",
  CONFIRMED: "The restaurant is preparing your food.",
  READY_FOR_PICKUP: "Your food is ready. A student courier will pick it up next.",
  ASSIGNED: "A courier is on the way to pick up your order.",
  PICKED_UP: "Your courier has your food and is heading to your building.",
  DELIVERED: "Enjoy your meal.",
  CANCELLED: "This order was cancelled. No payment was taken.",
  DELIVERY_FAILED: "Your courier couldn't complete the delivery. No payment was taken.",
};

/** The usual path an order takes, shown as the tracking steps. */
export const HAPPY_PATH: OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
];
