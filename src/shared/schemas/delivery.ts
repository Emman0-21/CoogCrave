import { z } from "zod";

import { TRANSPORT_MODES, type CourierStatus, type OrderStatus, type TransportMode } from "@/shared/enums";

/**
 * Courier and Kitchen Console contracts (docs/API_SPEC.md §8, §10). Couriers see only what a delivery
 * needs: offers carry no customer details at all (THREAT_MODEL T-05); the assigned courier sees the
 * customer's first name and last initial, and the instructions only while the delivery is active.
 */

export const courierApplicationSchema = z.strictObject({
  transportMode: z.enum(TRANSPORT_MODES, "Choose how you'll get around campus."),
  acceptGuidelines: z.literal(true, "Agree to the courier guidelines to apply."),
});
export type CourierApplicationInput = z.infer<typeof courierApplicationSchema>;

export const availabilitySchema = z.strictObject({ online: z.boolean() });

export const offerParamsSchema = z.strictObject({ orderId: z.uuid() });

export const deliveriesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface CourierProfileView {
  id: string;
  status: CourierStatus;
  transportMode: TransportMode;
  isOnline: boolean;
  onlineSince: string | null;
  appliedAt: string;
  reviewNote: string | null;
}

/** What a courier sees before accepting: where from, where to, how big, and the simulated payout. */
export interface OfferView {
  orderId: string;
  restaurantName: string;
  pickupLocation: string;
  dropLocation: string;
  itemCount: number;
  readySince: string;
  estimatedPayoutCents: number;
  payoutIsSimulated: true;
}

/** The assigned courier's view of an order (API_SPEC §7.1). No prices except the simulated payout. */
export interface CourierOrderView {
  viewer: "COURIER";
  id: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  restaurant: { name: string; pickupLocation: string; pickupNotes: string | null };
  items: { name: string; quantity: number; options: string[]; specialInstructions: string | null }[];
  deliveryLocation: { name: string };
  /** Only while the delivery is active. */
  deliveryInstructions: string | null;
  /** Display name, or first name and last initial. */
  customerName: string;
  timeline: { status: OrderStatus; at: string }[];
  assignment: {
    assignedAt: string;
    pickedUpAt: string | null;
    endedAt: string | null;
    endReason: string | null;
  };
  payoutCents: number;
  payoutIsSimulated: true;
  allowedTransitions: { toStatus: OrderStatus; reasonRequired: boolean }[];
}

export interface DeliverySummaryView {
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  dropLocation: string;
  assignedAt: string;
  endedAt: string | null;
  endReason: string | null;
  payoutCents: number | null;
}

export interface EarningsView {
  simulated: true;
  todayCents: number;
  weekCents: number;
  allTimeCents: number;
  completedDeliveries: number;
  averageRating: number | null;
  ratingsCount: number;
}

// ── Kitchen Console (admins acting as the simulated restaurant) ─────────────────

export interface KitchenOrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  restaurantName: string;
  placedAt: string;
  statusUpdatedAt: string;
  dropLocation: string;
  items: { name: string; quantity: number; options: string[]; specialInstructions: string | null }[];
}
