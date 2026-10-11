import { z } from "zod";

import {
  type ActorType,
  type AssignmentEndReason,
  COURIER_STATUSES,
  type CourierStatus,
  ORDER_STATUSES,
  type OrderStatus,
  type TransportMode,
  type UserRole,
} from "@/shared/enums";

import type { ReviewView } from "./engagement";
import { oneOrMany, requiredNote, optionalNote, type PriceView } from "./ordering";

/**
 * Admin contracts (docs/API_SPEC.md §10). Request schemas are strict. Every admin change is audited
 * server-side; nothing here lets a client set a role, an approval it isn't allowed to make, or a time.
 */

const limit = z.coerce.number().int().min(1).max(50).default(25);
const cursor = z.string().max(200).optional();
const search = z.string().trim().max(100).optional();

// ── Users ──────────────────────────────────────────────────────────────────────

export const adminUsersQuerySchema = z.strictObject({
  q: search,
  role: z.enum(["STUDENT", "ADMIN"] satisfies UserRole[]).optional(),
  suspended: z.enum(["true", "false"]).optional(),
  limit,
  cursor,
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const userParamsSchema = z.strictObject({ userId: z.uuid() });

export const suspendUserSchema = z.strictObject({
  suspended: z.boolean(),
  reason: requiredNote(300),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  suspendedAt: string | null;
  courierStatus: CourierStatus | null;
  createdAt: string;
}

export interface AdminUserListView {
  data: AdminUserView[];
  nextCursor: string | null;
}

// ── Couriers ───────────────────────────────────────────────────────────────────

export const adminCouriersQuerySchema = z.strictObject({
  status: z.enum(COURIER_STATUSES).optional(),
});

export const courierParamsSchema = z.strictObject({ courierId: z.uuid() });

export const COURIER_DECISIONS = ["APPROVE", "REJECT", "SUSPEND", "REINSTATE"] as const;
export type CourierDecision = (typeof COURIER_DECISIONS)[number];

export const courierDecisionSchema = z.strictObject({
  decision: z.enum(COURIER_DECISIONS),
  note: optionalNote(500),
});
export type CourierDecisionInput = z.infer<typeof courierDecisionSchema>;

export interface AdminCourierView {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: CourierStatus;
  transportMode: TransportMode;
  isOnline: boolean;
  appliedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  completedDeliveries: number;
  hasActiveDelivery: boolean;
}

// ── Orders ─────────────────────────────────────────────────────────────────────

export const adminOrdersQuerySchema = z.strictObject({
  status: oneOrMany(z.enum(ORDER_STATUSES)).optional(),
  restaurantId: z.uuid().optional(),
  q: search,
  limit,
  cursor,
});
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export interface AdminOrderSummaryView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  restaurantName: string;
  customerName: string;
  customerEmail: string;
  totalCents: number;
  createdAt: string;
  statusUpdatedAt: string;
}

export interface AdminOrderListView {
  data: AdminOrderSummaryView[];
  nextCursor: string | null;
}

/** Everything about one order, for admins (API_SPEC §7.1, "Admin" column). */
export interface AdminOrderView {
  viewer: "ADMIN";
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusUpdatedAt: string;
  version: number;
  createdAt: string;
  restaurant: { id: string; slug: string; name: string; pickupLocation: string };
  customer: { id: string; name: string; email: string };
  items: {
    name: string;
    quantity: number;
    lineTotalCents: number;
    options: string[];
    specialInstructions: string | null;
  }[];
  price: PriceView;
  deliveryLocation: { id: string; name: string };
  deliveryInstructions: string | null;
  timeline: {
    status: OrderStatus;
    fromStatus: OrderStatus | null;
    at: string;
    actorType: ActorType;
    actor: { id: string; name: string } | null;
    reason: string | null;
  }[];
  assignments: {
    courierId: string;
    courierName: string;
    courierEmail: string;
    assignedAt: string;
    pickedUpAt: string | null;
    endedAt: string | null;
    endReason: AssignmentEndReason | null;
    payoutCents: number | null;
  }[];
  payment: {
    mode: "DEMO";
    status: "AUTHORIZED" | "CAPTURED" | "VOIDED";
    amountCents: number;
    reference: string;
  } | null;
  review: ReviewView | null;
  /** Moves an admin can make here as ADMIN (all need a reason). Kitchen moves live in the Kitchen Console. */
  allowedTransitions: { toStatus: OrderStatus; reasonRequired: boolean }[];
}

// ── Restaurants and menus (essentials, PRD ADM-4, ADM-5) ──────────────────────

export const restaurantParamsSchema = z.strictObject({ restaurantId: z.uuid() });
export const menuItemParamsSchema = z.strictObject({ menuItemId: z.uuid() });

/** Phase 6b scope: open or close a restaurant for orders. Other restaurant fields come from the seed. */
export const restaurantPatchSchema = z.strictObject({ isAcceptingOrders: z.boolean() });
export type RestaurantPatchInput = z.infer<typeof restaurantPatchSchema>;

/** The most an item may cost: $100. Catches a typo like 6990 for 6.99 dollars before a customer sees it. */
export const MAX_ITEM_PRICE_CENTS = 10_000;

/** Phase 6b scope: mark an item sold out (or back), and change its price. */
export const menuItemPatchSchema = z
  .strictObject({
    isAvailable: z.boolean().optional(),
    priceCents: z
      .number()
      .int("Use whole cents.")
      .min(0, "A price can't be negative.")
      .max(MAX_ITEM_PRICE_CENTS, "Prices are at most $100.00.")
      .optional(),
  })
  .refine((v) => v.isAvailable !== undefined || v.priceCents !== undefined, "Change something.");
export type MenuItemPatchInput = z.infer<typeof menuItemPatchSchema>;

export interface AdminRestaurantView {
  id: string;
  isAcceptingOrders: boolean;
}

export interface AdminMenuItemView {
  id: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
}

// ── Dashboard and demo ─────────────────────────────────────────────────────────

export interface AdminMetricsView {
  /** Orders placed today (campus time), by current status. */
  ordersToday: Record<OrderStatus, number>;
  onlineCouriers: number;
  pendingApplications: number;
  activeDeliveries: number;
  /** Sum of simulated payments captured today (delivered orders). Nobody is charged. */
  simulatedGmvTodayCents: number;
}

export const DEMO_RESET_PHRASE = "RESET DEMO DATA";
export const demoResetSchema = z.strictObject({
  confirm: z.literal(DEMO_RESET_PHRASE, `Type ${DEMO_RESET_PHRASE} to confirm.`),
});

export interface DemoResetView {
  resetAt: string;
  removed: { orders: number; carts: number; notifications: number };
  fixtures: { restaurants: number; accounts: number };
}
