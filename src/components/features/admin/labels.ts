import type { ActorType, AssignmentEndReason, CourierStatus, OrderStatus } from "@/shared/enums";

/** Short status names for admin tables (the customer pages use fuller sentences). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "New",
  CONFIRMED: "Preparing",
  READY_FOR_PICKUP: "Ready for pickup",
  ASSIGNED: "Courier assigned",
  PICKED_UP: "Picked up",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  DELIVERY_FAILED: "Delivery failed",
};

export const COURIER_STATUS_LABEL: Record<CourierStatus, string> = {
  PENDING: "Waiting for review",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  SUSPENDED: "Suspended",
};

export const ACTOR_LABEL: Record<ActorType, string> = {
  CUSTOMER: "Customer",
  COURIER: "Courier",
  RESTAURANT_SIM: "Restaurant (simulated)",
  ADMIN: "Admin",
  SYSTEM: "System",
};

export const END_REASON_LABEL: Record<AssignmentEndReason, string> = {
  DELIVERED: "Delivered",
  RELEASED_BY_COURIER: "Given back by the courier",
  UNASSIGNED_BY_ADMIN: "Unassigned by an admin",
  ORDER_CANCELLED: "Order cancelled",
  DELIVERY_FAILED: "Delivery failed",
};

/** What each admin resolution is called on the order page (ARCHITECTURE §6: T2, T4, T6, T7, T9, T11). */
export function resolutionLabel(from: OrderStatus, to: OrderStatus): string {
  if (to === "CANCELLED") return "Cancel order";
  if (to === "DELIVERY_FAILED") return "Close as not delivered";
  if (from === "ASSIGNED" && to === "READY_FOR_PICKUP") return "Unassign courier";
  return ORDER_STATUS_LABEL[to];
}

export const TONE_BY_STATUS: Record<OrderStatus, "open" | "done" | "stopped"> = {
  PLACED: "open",
  CONFIRMED: "open",
  READY_FOR_PICKUP: "open",
  ASSIGNED: "open",
  PICKED_UP: "open",
  DELIVERED: "done",
  CANCELLED: "stopped",
  DELIVERY_FAILED: "stopped",
};
