import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { type Database, type DbExecutor, getDb, type Transaction } from "@/server/db/client";
import {
  campuses,
  cartItemOptions,
  cartItems,
  carts,
  menuCategories,
  menuItems,
  menuOptionGroups,
  menuOptions,
  restaurants,
} from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { openStatus } from "@/server/domain/hours";
import { describeOptionProblem, type OptionProblem, validateSelection } from "@/server/domain/options";
import { meetsMinimumSubtotal, type PricingConfig, priceLine, QUANTITY_MAX } from "@/server/domain/pricing";
import { AppError } from "@/server/http/errors";
import type {
  AddCartItemInput,
  CartItemProblem,
  CartLineView,
  CartProblem,
  CartView,
} from "@/shared/schemas/ordering";

import { hoursByRestaurant, loadOptionGroups } from "./catalog";

/** Distinct lines per cart; stops a script from growing one cart without bound. */
export const MAX_CART_LINES = 25;

export interface LoadedOption {
  id: string;
  groupName: string;
  name: string;
  priceDeltaCents: number;
}

export interface LoadedLine extends CartLineView {
  /** Option snapshots for order placement (group and option names at this moment). */
  selected: LoadedOption[];
}

export interface LoadedCart {
  cartId: string;
  restaurant: {
    id: string;
    slug: string;
    name: string;
    campusId: string;
    pickupLocationId: string;
    exists: boolean;
    isOpenNow: boolean;
    isAcceptingOrders: boolean;
    pricing: PricingConfig;
  };
  lines: LoadedLine[];
  subtotalCents: number;
  problems: CartProblem[];
}

const optionProblemToItemProblem = (problem: OptionProblem): CartItemProblem =>
  problem.kind === "TOO_FEW" || problem.kind === "TOO_MANY" ? "INVALID_OPTIONS" : "ITEM_UNAVAILABLE";

/**
 * Reads a user's cart with live menu data and prices (PRD CART-4). Carts store no prices: every read
 * re-prices from the menu and re-checks availability and option rules, because the menu may have changed
 * since the item was added. With `lock`, the cart row is locked for the rest of the transaction.
 */
export async function loadCart(
  db: DbExecutor,
  userId: string,
  now: Date,
  options: { lock?: boolean } = {},
): Promise<LoadedCart | null> {
  const cartQuery = db
    .select({ id: carts.id, restaurantId: carts.restaurantId })
    .from(carts)
    .where(eq(carts.userId, userId));
  const [cart] = options.lock ? await cartQuery.for("update") : await cartQuery;
  if (!cart) return null;

  const [restaurant] = await db
    .select({
      id: restaurants.id,
      slug: restaurants.slug,
      name: restaurants.name,
      campusId: restaurants.campusId,
      pickupLocationId: restaurants.locationId,
      deletedAt: restaurants.deletedAt,
      isAcceptingOrders: restaurants.isAcceptingOrders,
      timeZone: campuses.timezone,
      deliveryFeeCents: campuses.deliveryFeeCents,
      serviceFeeBps: campuses.serviceFeeBps,
      serviceFeeMinCents: campuses.serviceFeeMinCents,
      serviceFeeMaxCents: campuses.serviceFeeMaxCents,
      taxRateBps: campuses.taxRateBps,
      minSubtotalCents: campuses.minSubtotalCents,
      maxTipCents: campuses.maxTipCents,
    })
    .from(restaurants)
    .innerJoin(campuses, eq(campuses.id, restaurants.campusId))
    .where(eq(restaurants.id, cart.restaurantId));
  if (!restaurant) throw new Error(`cart ${cart.id} references a missing restaurant`);

  const rows = await db
    .select({
      id: cartItems.id,
      menuItemId: cartItems.menuItemId,
      quantity: cartItems.quantity,
      specialInstructions: cartItems.specialInstructions,
      name: menuItems.name,
      priceCents: menuItems.priceCents,
      isAvailable: menuItems.isAvailable,
      itemDeletedAt: menuItems.deletedAt,
      categoryDeletedAt: menuCategories.deletedAt,
    })
    .from(cartItems)
    .innerJoin(menuItems, eq(menuItems.id, cartItems.menuItemId))
    .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));

  const lineIds = rows.map((r) => r.id);
  const chosen = lineIds.length
    ? await db
        .select({
          cartItemId: cartItemOptions.cartItemId,
          optionId: menuOptions.id,
          name: menuOptions.name,
          priceDeltaCents: menuOptions.priceDeltaCents,
          groupName: menuOptionGroups.name,
        })
        .from(cartItemOptions)
        .innerJoin(menuOptions, eq(menuOptions.id, cartItemOptions.menuOptionId))
        .innerJoin(menuOptionGroups, eq(menuOptionGroups.id, menuOptions.optionGroupId))
        .where(inArray(cartItemOptions.cartItemId, lineIds))
        .orderBy(asc(menuOptionGroups.sortOrder), asc(menuOptions.sortOrder))
    : [];
  const groups = await loadOptionGroups(db, [...new Set(rows.map((r) => r.menuItemId))]);

  const lines: LoadedLine[] = rows.map((row) => {
    const selected = chosen
      .filter((c) => c.cartItemId === row.id)
      .map((c) => ({
        id: c.optionId,
        groupName: c.groupName,
        name: c.name,
        priceDeltaCents: c.priceDeltaCents,
      }));
    const problems = new Set<CartItemProblem>();
    if (!row.isAvailable || row.itemDeletedAt || row.categoryDeletedAt || restaurant.deletedAt) {
      problems.add("ITEM_UNAVAILABLE");
    }
    const check = validateSelection(
      groups.get(row.menuItemId) ?? [],
      selected.map((s) => s.id),
    );
    if (!check.ok) check.problems.forEach((p) => problems.add(optionProblemToItemProblem(p)));

    const price = priceLine({
      unitPriceCents: row.priceCents,
      optionDeltasCents: selected.map((s) => s.priceDeltaCents),
      quantity: row.quantity,
    });
    return {
      id: row.id,
      menuItemId: row.menuItemId,
      name: row.name,
      quantity: row.quantity,
      unitPriceCents: price.unitPriceCents,
      optionsTotalCents: price.optionsTotalCents,
      lineTotalCents: price.lineTotalCents,
      options: selected.map((s) => ({
        id: s.id,
        group: s.groupName,
        name: s.name,
        priceDeltaCents: s.priceDeltaCents,
      })),
      specialInstructions: row.specialInstructions,
      problems: [...problems],
      selected,
    };
  });

  const hours = (await hoursByRestaurant(db, [restaurant.id])).get(restaurant.id) ?? [];
  const isOpenNow = !restaurant.deletedAt && openStatus(hours, now, restaurant.timeZone).isOpen;
  const pricing: PricingConfig = {
    deliveryFeeCents: restaurant.deliveryFeeCents,
    serviceFeeBps: restaurant.serviceFeeBps,
    serviceFeeMinCents: restaurant.serviceFeeMinCents,
    serviceFeeMaxCents: restaurant.serviceFeeMaxCents,
    taxRateBps: restaurant.taxRateBps,
    minSubtotalCents: restaurant.minSubtotalCents,
    maxTipCents: restaurant.maxTipCents,
  };
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

  const problems: CartProblem[] = [];
  if (!isOpenNow || !restaurant.isAcceptingOrders) problems.push("RESTAURANT_CLOSED");
  if (lines.some((l) => l.problems.length > 0)) problems.push("ITEM_PROBLEMS");
  if (lines.length > 0 && !meetsMinimumSubtotal(subtotalCents, pricing))
    problems.push("BELOW_MINIMUM_SUBTOTAL");

  return {
    cartId: cart.id,
    restaurant: {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      campusId: restaurant.campusId,
      pickupLocationId: restaurant.pickupLocationId,
      exists: !restaurant.deletedAt,
      isOpenNow,
      isAcceptingOrders: restaurant.isAcceptingOrders,
      pricing,
    },
    lines,
    subtotalCents,
    problems,
  };
}

export const EMPTY_CART: CartView = {
  restaurant: null,
  items: [],
  itemCount: 0,
  subtotalCents: 0,
  minSubtotalCents: null,
  canCheckout: false,
  problems: [],
};

export function toCartView(cart: LoadedCart | null): CartView {
  if (!cart || cart.lines.length === 0) return EMPTY_CART;
  return {
    restaurant: {
      id: cart.restaurant.id,
      slug: cart.restaurant.slug,
      name: cart.restaurant.name,
      isOpenNow: cart.restaurant.isOpenNow,
      isAcceptingOrders: cart.restaurant.isAcceptingOrders,
    },
    items: cart.lines.map(({ selected: _selected, ...line }) => line),
    itemCount: cart.lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotalCents: cart.subtotalCents,
    minSubtotalCents: cart.restaurant.pricing.minSubtotalCents,
    canCheckout: cart.problems.length === 0,
    problems: cart.problems,
  };
}

/** GET /api/v1/cart */
export async function getCart(
  actor: Actor,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<CartView> {
  return toCartView(await loadCart(db, actor.userId, now));
}

/** Locks (or creates and locks) the user's cart row, so concurrent edits to one cart run one at a time. */
async function lockCart(tx: Transaction, userId: string) {
  const [cart] = await tx
    .select({ id: carts.id, restaurantId: carts.restaurantId })
    .from(carts)
    .where(eq(carts.userId, userId))
    .for("update");
  return cart ?? null;
}

const sameSelection = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * POST /api/v1/cart/items (PRD CART-1, CART-2). Validates availability and option rules on the server,
 * keeps the cart to one restaurant, and merges an identical line instead of duplicating it.
 */
export async function addCartItem(
  actor: Actor,
  input: AddCartItemInput,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<CartView> {
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: menuItems.id,
        restaurantId: menuItems.restaurantId,
        name: menuItems.name,
        isAvailable: menuItems.isAvailable,
        restaurantName: restaurants.name,
        restaurantSlug: restaurants.slug,
      })
      .from(menuItems)
      .innerJoin(restaurants, eq(restaurants.id, menuItems.restaurantId))
      .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
      .where(
        and(
          eq(menuItems.id, input.menuItemId),
          isNull(menuItems.deletedAt),
          isNull(menuCategories.deletedAt),
          isNull(restaurants.deletedAt),
        ),
      );
    if (!item) throw new AppError("NOT_FOUND", "We couldn't find that menu item.");
    if (!item.isAvailable) throw new AppError("ITEM_UNAVAILABLE", `${item.name} isn't available right now.`);

    const groups = (await loadOptionGroups(tx, [item.id])).get(item.id) ?? [];
    const check = validateSelection(groups, input.optionIds);
    if (!check.ok) {
      throw new AppError(
        "INVALID_OPTIONS",
        describeOptionProblem(check.problems[0]!),
        check.problems.map((p) => ({ ...p, message: describeOptionProblem(p) })),
      );
    }
    const optionIds = check.selected.map((o) => o.id);

    let cart = await lockCart(tx, actor.userId);
    if (cart && cart.restaurantId !== item.restaurantId) {
      if (!input.replaceCart) {
        const [current] = await tx
          .select({ name: restaurants.name, slug: restaurants.slug })
          .from(restaurants)
          .where(eq(restaurants.id, cart.restaurantId));
        throw new AppError(
          "CART_RESTAURANT_CONFLICT",
          `Your cart has items from ${current?.name ?? "another restaurant"}. Start a new cart to add this item.`,
          { currentRestaurant: current ?? null },
        );
      }
      await tx.delete(carts).where(eq(carts.id, cart.id));
      cart = null;
    }
    if (!cart) {
      // ON CONFLICT covers two first-adds racing; the loser then locks the winner's row.
      await tx
        .insert(carts)
        .values({ userId: actor.userId, restaurantId: item.restaurantId })
        .onConflictDoNothing();
      cart = await lockCart(tx, actor.userId);
      if (!cart || cart.restaurantId !== item.restaurantId) {
        throw new AppError(
          "CART_RESTAURANT_CONFLICT",
          "Your cart changed in another tab. Reload and try again.",
        );
      }
    }

    const existing = await tx
      .select({
        id: cartItems.id,
        quantity: cartItems.quantity,
        specialInstructions: cartItems.specialInstructions,
      })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.menuItemId, item.id)));
    const existingOptions = existing.length
      ? await tx
          .select({ cartItemId: cartItemOptions.cartItemId, optionId: cartItemOptions.menuOptionId })
          .from(cartItemOptions)
          .where(
            inArray(
              cartItemOptions.cartItemId,
              existing.map((e) => e.id),
            ),
          )
      : [];
    const match = existing.find(
      (line) =>
        line.specialInstructions === input.specialInstructions &&
        sameSelection(
          existingOptions.filter((o) => o.cartItemId === line.id).map((o) => o.optionId),
          optionIds,
        ),
    );

    if (match) {
      await tx
        .update(cartItems)
        .set({ quantity: Math.min(QUANTITY_MAX, match.quantity + input.quantity) })
        .where(eq(cartItems.id, match.id));
    } else {
      const [{ lines = 0 } = {}] = await tx
        .select({ lines: sql<number>`count(*)::int` })
        .from(cartItems)
        .where(eq(cartItems.cartId, cart.id));
      if (lines >= MAX_CART_LINES) {
        throw new AppError("CART_FULL", `A cart can hold up to ${MAX_CART_LINES} different items.`);
      }
      const [line] = await tx
        .insert(cartItems)
        .values({
          cartId: cart.id,
          restaurantId: item.restaurantId,
          menuItemId: item.id,
          quantity: input.quantity,
          specialInstructions: input.specialInstructions,
        })
        .returning({ id: cartItems.id });
      if (optionIds.length) {
        await tx
          .insert(cartItemOptions)
          .values(optionIds.map((menuOptionId) => ({ cartItemId: line!.id, menuOptionId })));
      }
    }
    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
  });
  return getCart(actor, now, db);
}

/** Deletes the cart row when its last line is gone, so an empty cart has no restaurant. */
async function dropCartIfEmpty(tx: Transaction, cartId: string): Promise<void> {
  const [remaining] = await tx
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId))
    .limit(1);
  if (!remaining) await tx.delete(carts).where(eq(carts.id, cartId));
}

/** PATCH /api/v1/cart/items/{id}: only lines in the caller's own cart; anything else is 404. */
export async function updateCartItemQuantity(
  actor: Actor,
  cartItemId: string,
  quantity: number,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<CartView> {
  await db.transaction(async (tx) => {
    const cart = await lockCart(tx, actor.userId);
    const updated = cart
      ? await tx
          .update(cartItems)
          .set({ quantity })
          .where(and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cart.id)))
          .returning({ id: cartItems.id })
      : [];
    if (updated.length === 0) throw new AppError("NOT_FOUND", "That item isn't in your cart.");
  });
  return getCart(actor, now, db);
}

/** DELETE /api/v1/cart/items/{id} */
export async function removeCartItem(
  actor: Actor,
  cartItemId: string,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<CartView> {
  await db.transaction(async (tx) => {
    const cart = await lockCart(tx, actor.userId);
    const removed = cart
      ? await tx
          .delete(cartItems)
          .where(and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cart.id)))
          .returning({ id: cartItems.id })
      : [];
    if (removed.length === 0 || !cart) throw new AppError("NOT_FOUND", "That item isn't in your cart.");
    await dropCartIfEmpty(tx, cart.id);
  });
  return getCart(actor, now, db);
}

/** DELETE /api/v1/cart */
export async function clearCart(actor: Actor, db: Database = getDb()): Promise<CartView> {
  await db.delete(carts).where(eq(carts.userId, actor.userId));
  return EMPTY_CART;
}
