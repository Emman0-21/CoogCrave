import "server-only";

import { createHash, randomInt } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { type Database, type DbExecutor, getDb, type Transaction } from "@/server/db/client";
import { uniqueViolationConstraint } from "@/server/db/pg-errors";
import {
  campusLocations,
  carts,
  orderItemOptions,
  orderItems,
  orders,
  orderStatusEvents,
  payments,
} from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { isValidTip, type PriceBreakdown, priceOrder } from "@/server/domain/pricing";
import { AppError, type ErrorCode } from "@/server/http/errors";
import { getPaymentGateway, type PaymentGateway } from "@/server/payments/gateway";
import type {
  CartProblem,
  OrderDetailView,
  PlaceOrderInput,
  QuoteInput,
  QuoteView,
} from "@/shared/schemas/ordering";

import { type LoadedCart, loadCart, toCartView } from "./cart";
import { notifyOrder } from "./notifications";
import { loadCustomerOrder } from "./orders";

/**
 * Checkout (PRD ORD-1…7, docs/ARCHITECTURE.md §7.2–7.3). Every amount is computed here from the
 * server-side cart and the current menu; the client's displayed total is only compared, never used.
 * Payment is SIMULATED (DemoPaymentGateway): no card is collected and no money moves.
 */

async function dropPoint(db: DbExecutor, locationId: string) {
  const [location] = await db
    .select({ id: campusLocations.id, name: campusLocations.name })
    .from(campusLocations)
    .where(
      and(
        eq(campusLocations.id, locationId),
        eq(campusLocations.isDropPoint, true),
        isNull(campusLocations.deletedAt),
      ),
    );
  if (!location) throw new AppError("INVALID_LOCATION", "Choose a drop-off building from the list.");
  return location;
}

function assertTip(tipCents: number, cart: LoadedCart): void {
  if (!isValidTip(tipCents, cart.restaurant.pricing)) {
    const max = (cart.restaurant.pricing.maxTipCents / 100).toFixed(2);
    throw new AppError("TIP_OUT_OF_RANGE", `Tips can be from $0.00 to $${max}.`);
  }
}

function buildQuote(cart: LoadedCart, tipCents: number): QuoteView {
  const view = toCartView(cart);
  const price: PriceBreakdown = priceOrder(cart.lines, tipCents, cart.restaurant.pricing);
  return {
    ...price,
    lines: view.items,
    restaurant: view.restaurant!,
    taxIsSample: true,
    paymentMode: "DEMO",
    maxTipCents: cart.restaurant.pricing.maxTipCents,
    canPlaceOrder: cart.problems.length === 0,
    problems: cart.problems,
  };
}

/** POST /api/v1/checkout/quote: the full price breakdown for the current cart. No side effects. */
export async function quote(
  actor: Actor,
  input: QuoteInput,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<QuoteView> {
  const cart = await loadCart(db, actor.userId, now);
  if (!cart || cart.lines.length === 0) throw new AppError("CART_EMPTY", "Your cart is empty.");
  await dropPoint(db, input.deliveryLocationId);
  assertTip(input.tipCents, cart);
  return buildQuote(cart, input.tipCents);
}

/** The first problem that blocks placing an order, as the error the API returns. */
function blockingError(cart: LoadedCart): AppError | null {
  const first: CartProblem | undefined = cart.problems[0];
  if (!first) return null;
  const messages: Record<CartProblem, [ErrorCode, string]> = {
    RESTAURANT_CLOSED: ["RESTAURANT_CLOSED", `${cart.restaurant.name} isn't taking orders right now.`],
    ITEM_PROBLEMS: ["ITEM_UNAVAILABLE", "Some items in your cart changed. Review your cart before ordering."],
    BELOW_MINIMUM_SUBTOTAL: [
      "BELOW_MINIMUM_SUBTOTAL",
      `Orders need at least $${(cart.restaurant.pricing.minSubtotalCents / 100).toFixed(2)} of food.`,
    ],
  };
  const [code, message] = messages[first];
  return new AppError(code, message, { problems: cart.problems });
}

/** SHA-256 of the fields that define a checkout attempt, in a fixed order (ARCHITECTURE §7.2). */
export function requestHash(input: PlaceOrderInput): string {
  const canonical = JSON.stringify([
    input.deliveryLocationId,
    input.deliveryInstructions,
    input.tipCents,
    input.expectedTotalCents,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

// Crockford base32 without I, L, O, U: no look-alike characters when read aloud at the counter.
const ORDER_NUMBER_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newOrderNumber(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  return `CC-${code}`;
}

export interface PlacedOrder {
  order: OrderDetailView;
  /** True when this request repeated an earlier one with the same Idempotency-Key. */
  replayed: boolean;
}

/** An earlier order with this key: replay it if the request matches, refuse if it doesn't. */
async function replay(
  db: DbExecutor,
  actor: Actor,
  idempotencyKey: string,
  hash: string,
): Promise<PlacedOrder | null> {
  const [existing] = await db
    .select({ id: orders.id, requestHash: orders.requestHash })
    .from(orders)
    .where(and(eq(orders.customerId, actor.userId), eq(orders.idempotencyKey, idempotencyKey)));
  if (!existing) return null;
  if (existing.requestHash !== hash) {
    throw new AppError(
      "IDEMPOTENCY_KEY_REUSED",
      "This checkout attempt was already used for a different order. Reload the page and try again.",
    );
  }
  const order = await loadCustomerOrder(db, existing.id, actor.userId);
  if (!order) throw new Error("replayed order disappeared");
  return { order, replayed: true };
}

const MAX_ORDER_NUMBER_ATTEMPTS = 5;

/** Inserts the order row, retrying with a new number if a random one is already taken. */
async function insertOrder(
  tx: Transaction,
  values: Omit<typeof orders.$inferInsert, "orderNumber">,
): Promise<{ id: string; orderNumber: string }> {
  for (let attempt = 1; ; attempt++) {
    const orderNumber = newOrderNumber();
    try {
      // A savepoint, so a number collision rolls back only this insert, not the whole checkout.
      return await tx.transaction(async (sp) => {
        const [row] = await sp
          .insert(orders)
          .values({ ...values, orderNumber })
          .returning({ id: orders.id, orderNumber: orders.orderNumber });
        return row!;
      });
    } catch (error) {
      const collided = uniqueViolationConstraint(error) === "orders_order_number_unique";
      if (!collided || attempt >= MAX_ORDER_NUMBER_ATTEMPTS) throw error;
    }
  }
}

/**
 * POST /api/v1/orders (PRD ORD-3…6). Idempotent per Idempotency-Key: a retry with the same key and body
 * returns the first order; the same key with a different body is refused. In one transaction it locks
 * the cart, re-prices it, checks the restaurant is open, snapshots items and options, records the status
 * event, a simulated payment authorization, and a notification, and empties the cart.
 */
export async function placeOrder(
  actor: Actor,
  input: PlaceOrderInput,
  idempotencyKey: string,
  now: Date = new Date(),
  db: Database = getDb(),
  gateway: PaymentGateway = getPaymentGateway(),
): Promise<PlacedOrder> {
  const hash = requestHash(input);
  const earlier = await replay(db, actor, idempotencyKey, hash);
  if (earlier) return earlier;

  try {
    return await db.transaction(async (tx): Promise<PlacedOrder> => {
      // Locking the cart makes concurrent checkouts for one user run one at a time. A duplicate request
      // that waited here finds the first one's order below and replays it instead of failing.
      const cart = await loadCart(tx, actor.userId, now, { lock: true });
      const raced = await replay(tx, actor, idempotencyKey, hash);
      if (raced) return raced;

      if (!cart || cart.lines.length === 0) throw new AppError("CART_EMPTY", "Your cart is empty.");
      const location = await dropPoint(tx, input.deliveryLocationId);
      assertTip(input.tipCents, cart);
      const blocked = blockingError(cart);
      if (blocked) throw blocked;

      const price = priceOrder(cart.lines, input.tipCents, cart.restaurant.pricing);
      if (price.totalCents !== input.expectedTotalCents) {
        throw new AppError(
          "PRICE_CHANGED",
          "Prices changed since you opened checkout. Review the new total.",
          {
            quote: buildQuote(cart, input.tipCents),
          },
        );
      }

      const order = await insertOrder(tx, {
        customerId: actor.userId,
        campusId: cart.restaurant.campusId,
        restaurantId: cart.restaurant.id,
        restaurantNameSnapshot: cart.restaurant.name,
        deliveryLocationId: location.id,
        deliveryLocationSnapshot: location.name,
        deliveryInstructions: input.deliveryInstructions,
        ...price,
        idempotencyKey,
        requestHash: hash,
      });

      for (const line of cart.lines) {
        const [item] = await tx
          .insert(orderItems)
          .values({
            orderId: order.id,
            restaurantId: cart.restaurant.id,
            menuItemId: line.menuItemId,
            nameSnapshot: line.name,
            unitPriceCents: line.unitPriceCents,
            optionsTotalCents: line.optionsTotalCents,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
            specialInstructions: line.specialInstructions,
          })
          .returning({ id: orderItems.id });
        if (line.selected.length) {
          await tx.insert(orderItemOptions).values(
            line.selected.map((option) => ({
              orderItemId: item!.id,
              menuOptionId: option.id,
              groupNameSnapshot: option.groupName,
              optionNameSnapshot: option.name,
              priceDeltaCents: option.priceDeltaCents,
            })),
          );
        }
      }

      await tx.insert(orderStatusEvents).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: "PLACED",
        actorType: "CUSTOMER",
        actorUserId: actor.userId,
      });

      const { providerReference } = await gateway.authorize(price.totalCents);
      await tx.insert(payments).values({
        orderId: order.id,
        provider: gateway.provider,
        status: "AUTHORIZED",
        amountCents: price.totalCents,
        providerReference,
      });

      await notifyOrder(tx, "ORDER_PLACED", {
        userId: actor.userId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantName: cart.restaurant.name,
      });

      await tx.delete(carts).where(eq(carts.id, cart.cartId));

      const detail = await loadCustomerOrder(tx, order.id, actor.userId);
      return { order: detail!, replayed: false };
    });
  } catch (error) {
    // Two requests with the same key that both got past the checks: the loser replays the winner.
    if (uniqueViolationConstraint(error) === "orders_customer_idempotency_unique") {
      const winner = await replay(db, actor, idempotencyKey, hash);
      if (winner) return winner;
    }
    throw error;
  }
}
