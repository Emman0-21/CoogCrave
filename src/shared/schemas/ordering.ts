import { z } from "zod";

import type { ActorType, OrderStatus, TransportMode } from "@/shared/enums";
import type { ReviewView } from "./engagement";

/**
 * Request schemas and response types for catalog, cart, checkout, and orders (docs/API_SPEC.md §5–7).
 * Shared by the API routes and the browser, so both validate the same way. Request schemas are strict:
 * unknown fields such as a client-supplied price are rejected, never ignored (THREAT_MODEL T-08).
 */

const uuid = (message = "Invalid ID.") => z.uuid(message);

const SAFE_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f<>]/;

/** Required free text (a reason, a note): trimmed, 1–max characters, same character rules as notes. */
export const requiredNote = (max: number, emptyMessage = "Give a reason.") =>
  z
    .string()
    .trim()
    .min(1, emptyMessage)
    .max(max, `Use at most ${max} characters.`)
    .refine((value) => !SAFE_TEXT.test(value), "Use letters, numbers, and punctuation only.");

/** Optional free text: trimmed; empty becomes null; no control characters except line breaks; no < >. */
export const optionalNote = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .refine((value) => !SAFE_TEXT.test(value), "Use letters, numbers, and punctuation only.")
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export const QUANTITY_LIMITS = { min: 1, max: 20 } as const;
const quantity = z
  .number()
  .int("Use a whole number.")
  .min(QUANTITY_LIMITS.min, `At least ${QUANTITY_LIMITS.min}.`)
  .max(QUANTITY_LIMITS.max, `At most ${QUANTITY_LIMITS.max}.`);

// ── Catalog ────────────────────────────────────────────────────────────────────

export const oneOrMany = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema).max(10)]).transform((v) => (Array.isArray(v) ? v : [v]));

export const restaurantListQuerySchema = z.strictObject({
  q: z.string().trim().max(60, "Use at most 60 characters.").optional(),
  cuisine: oneOrMany(z.string().regex(/^[a-z0-9-]{1,40}$/)).optional(),
  openNow: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type RestaurantListQuery = z.infer<typeof restaurantListQuerySchema>;

export const restaurantSlugParamsSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(80),
});

export interface CuisineView {
  slug: string;
  name: string;
}

export interface RestaurantSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cuisines: CuisineView[];
  location: { id: string; name: string; shortName: string };
  isOpenNow: boolean;
  /** Wall-clock minute (0–1439, campus time) the current opening ends, when open. */
  closesAtMinute: number | null;
  /** ISO instant of the next opening within a week, when closed. */
  nextOpenAt: string | null;
  isAcceptingOrders: boolean;
  /** Open now and accepting orders. */
  canOrder: boolean;
  isSampleData: boolean;
  /** Up to three menu items whose names matched the search, when searching. */
  matchingItems: string[];
}

export interface MenuOptionView {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
}

export interface MenuOptionGroupView {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOptionView[];
}

export interface MenuItemView {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  optionGroups: MenuOptionGroupView[];
}

export interface RestaurantDetail extends RestaurantSummary {
  pickupNotes: string | null;
  timeZone: string;
  hours: { dayOfWeek: number; opensAtMinute: number; closesAtMinute: number }[];
  menu: { categoryId: string; name: string; items: MenuItemView[] }[];
}

// ── Cart ───────────────────────────────────────────────────────────────────────

export const addCartItemSchema = z.strictObject({
  menuItemId: uuid("Choose an item."),
  quantity,
  optionIds: z.array(uuid()).max(20).default([]),
  specialInstructions: optionalNote(140),
  replaceCart: z.boolean().default(false),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.strictObject({ quantity });
export const cartItemParamsSchema = z.strictObject({ cartItemId: uuid() });

export type CartItemProblem = "ITEM_UNAVAILABLE" | "INVALID_OPTIONS";
export type CartProblem = "RESTAURANT_CLOSED" | "BELOW_MINIMUM_SUBTOTAL" | "ITEM_PROBLEMS";

export interface CartLineView {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  optionsTotalCents: number;
  lineTotalCents: number;
  options: { id: string; group: string; name: string; priceDeltaCents: number }[];
  specialInstructions: string | null;
  problems: CartItemProblem[];
}

export interface CartView {
  restaurant: {
    id: string;
    slug: string;
    name: string;
    isOpenNow: boolean;
    isAcceptingOrders: boolean;
  } | null;
  items: CartLineView[];
  itemCount: number;
  subtotalCents: number;
  minSubtotalCents: number | null;
  canCheckout: boolean;
  problems: CartProblem[];
}

// ── Checkout and orders ────────────────────────────────────────────────────────

const tipCents = z.number().int("Use whole cents.").min(0, "Tips can't be negative.");

export const quoteSchema = z.strictObject({
  deliveryLocationId: uuid("Choose a drop-off building."),
  tipCents,
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const placeOrderSchema = z.strictObject({
  deliveryLocationId: uuid("Choose a drop-off building."),
  deliveryInstructions: optionalNote(280),
  tipCents,
  expectedTotalCents: z.number().int().min(0),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export interface PriceView {
  subtotalCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

export interface QuoteView extends PriceView {
  lines: CartLineView[];
  restaurant: NonNullable<CartView["restaurant"]>;
  taxIsSample: true;
  paymentMode: "DEMO";
  maxTipCents: number;
  canPlaceOrder: boolean;
  problems: CartProblem[];
}

export const orderListQuerySchema = z.strictObject({
  scope: z.enum(["active", "past"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const orderParamsSchema = z.strictObject({ orderId: uuid() });

export const transitionSchema = z.strictObject({
  toStatus: z.enum([
    "PLACED",
    "CONFIRMED",
    "READY_FOR_PICKUP",
    "ASSIGNED",
    "PICKED_UP",
    "DELIVERED",
    "CANCELLED",
    "DELIVERY_FAILED",
  ] satisfies OrderStatus[]),
  reason: optionalNote(300),
  /** Admins only: act as the simulated restaurant (Kitchen Console). Anyone else sending it gets 403. */
  actingAs: z.literal("RESTAURANT_SIM").optional(),
  expectedVersion: z.number().int().min(0).optional(),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export interface OrderListView {
  data: OrderSummaryView[];
  nextCursor: string | null;
}

export interface OrderSummaryView {
  id: string;
  orderNumber: string;
  restaurantName: string;
  status: OrderStatus;
  totalCents: number;
  itemCount: number;
  createdAt: string;
}

export interface AllowedTransitionView {
  toStatus: OrderStatus;
  actingAs: "RESTAURANT_SIM" | null;
  reasonRequired: boolean;
}

export interface OrderDetailView {
  viewer: "CUSTOMER";
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusUpdatedAt: string;
  version: number;
  createdAt: string;
  restaurant: { id: string; slug: string; name: string; pickupLocation: string };
  items: {
    name: string;
    quantity: number;
    unitPriceCents: number;
    optionsTotalCents: number;
    lineTotalCents: number;
    options: { group: string; name: string; priceDeltaCents: number }[];
    specialInstructions: string | null;
  }[];
  price: PriceView;
  deliveryLocation: { id: string; name: string };
  deliveryInstructions: string | null;
  timeline: { status: OrderStatus; at: string; actorType: ActorType }[];
  payment: { mode: "DEMO"; status: "AUTHORIZED" | "CAPTURED" | "VOIDED" };
  /** Once a courier is assigned: their first name and how they're getting around. */
  courier: { firstName: string; transportMode: TransportMode } | null;
  /** The customer's rating, once given (PRD REV-1). */
  review: ReviewView | null;
  allowedTransitions: AllowedTransitionView[];
}
