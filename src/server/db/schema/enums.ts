import { pgEnum } from "drizzle-orm/pg-core";

import {
  ACTOR_TYPES,
  ASSIGNMENT_END_REASONS,
  COURIER_STATUSES,
  NOTIFICATION_TYPES,
  ORDER_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  TRANSPORT_MODES,
  USER_ROLES,
} from "@/shared/enums";

// Postgres enums are generated from the same constants the app and API schemas use,
// so a value can't exist in one place and not the other.
export const userRole = pgEnum("user_role", USER_ROLES);
export const courierStatus = pgEnum("courier_status", COURIER_STATUSES);
export const transportMode = pgEnum("transport_mode", TRANSPORT_MODES);
export const orderStatus = pgEnum("order_status", ORDER_STATUSES);
export const actorType = pgEnum("actor_type", ACTOR_TYPES);
export const assignmentEndReason = pgEnum("assignment_end_reason", ASSIGNMENT_END_REASONS);
export const paymentProvider = pgEnum("payment_provider", PAYMENT_PROVIDERS);
export const paymentStatus = pgEnum("payment_status", PAYMENT_STATUSES);
export const notificationType = pgEnum("notification_type", NOTIFICATION_TYPES);
