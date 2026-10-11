/**
 * Domain enumerations shared by the database schema, API schemas, and UI.
 * Safe to import from client code (no server dependencies).
 */

export const USER_ROLES = ["STUDENT", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COURIER_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
export type CourierStatus = (typeof COURIER_STATUSES)[number];

export const TRANSPORT_MODES = ["WALK", "BIKE", "SCOOTER"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const ORDER_STATUSES = [
  "PLACED",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "CANCELLED",
  "DELIVERY_FAILED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ACTOR_TYPES = ["CUSTOMER", "COURIER", "RESTAURANT_SIM", "ADMIN", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ASSIGNMENT_END_REASONS = [
  "DELIVERED",
  "RELEASED_BY_COURIER",
  "UNASSIGNED_BY_ADMIN",
  "ORDER_CANCELLED",
  "DELIVERY_FAILED",
] as const;
export type AssignmentEndReason = (typeof ASSIGNMENT_END_REASONS)[number];

export const PAYMENT_PROVIDERS = ["DEMO"] as const;
export const PAYMENT_STATUSES = ["AUTHORIZED", "CAPTURED", "VOIDED"] as const;

export const NOTIFICATION_TYPES = [
  "ORDER_PLACED",
  "ORDER_CONFIRMED",
  "ORDER_READY",
  "COURIER_ASSIGNED",
  "COURIER_RELEASED",
  "ORDER_PICKED_UP",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
  "DELIVERY_FAILED",
  "COURIER_APPLICATION_DECIDED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
