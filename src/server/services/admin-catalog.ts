import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { type Database, getDb } from "@/server/db/client";
import { menuItems, restaurants } from "@/server/db/schema";
import type { Actor } from "@/server/domain/actor";
import { AppError } from "@/server/http/errors";
import type {
  AdminMenuItemView,
  AdminRestaurantView,
  MenuItemPatchInput,
  RestaurantPatchInput,
} from "@/shared/schemas/admin";

import { recordAudit } from "./audit";

/**
 * Restaurant and menu editing, essentials only (PRD ADM-4, ADM-5; scope decided at the start of
 * Phase 6): open or close a restaurant for orders, mark items sold out, change prices. Each change is
 * audited with the before and after values. Existing orders never change (they keep snapshots); carts
 * re-price on their next read, and checkout refuses a total the customer didn't see (PRICE_CHANGED).
 *
 * `pnpm db:seed` and demo reset restore the sample values, so these are for running the demo, not for
 * maintaining a real catalog.
 */

/** PATCH /api/v1/admin/restaurants/{id}. Repeating the current state changes nothing and isn't audited. */
export async function updateRestaurant(
  admin: Actor,
  restaurantId: string,
  input: RestaurantPatchInput,
  requestId?: string,
  db: Database = getDb(),
): Promise<AdminRestaurantView> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: restaurants.id,
        name: restaurants.name,
        isAcceptingOrders: restaurants.isAcceptingOrders,
      })
      .from(restaurants)
      .where(and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt)))
      .for("update");
    if (!current) throw new AppError("NOT_FOUND", "We couldn't find that restaurant.");

    if (current.isAcceptingOrders !== input.isAcceptingOrders) {
      await tx
        .update(restaurants)
        .set({ isAcceptingOrders: input.isAcceptingOrders, updatedAt: new Date() })
        .where(eq(restaurants.id, current.id));
      await recordAudit(tx, {
        by: { kind: "ADMIN", actor: admin },
        action: "restaurant.update",
        targetType: "restaurant",
        targetId: current.id,
        metadata: {
          name: current.name,
          before: { isAcceptingOrders: current.isAcceptingOrders },
          after: { isAcceptingOrders: input.isAcceptingOrders },
        },
        requestId,
      });
    }
    return { id: current.id, isAcceptingOrders: input.isAcceptingOrders };
  });
}

/** PATCH /api/v1/admin/menu-items/{id}: availability and/or price. Only real changes are audited. */
export async function updateMenuItem(
  admin: Actor,
  menuItemId: string,
  input: MenuItemPatchInput,
  requestId?: string,
  db: Database = getDb(),
): Promise<AdminMenuItemView> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: menuItems.id,
        name: menuItems.name,
        restaurantId: menuItems.restaurantId,
        priceCents: menuItems.priceCents,
        isAvailable: menuItems.isAvailable,
      })
      .from(menuItems)
      .innerJoin(restaurants, eq(restaurants.id, menuItems.restaurantId))
      .where(and(eq(menuItems.id, menuItemId), isNull(menuItems.deletedAt), isNull(restaurants.deletedAt)))
      .for("update", { of: menuItems });
    if (!current) throw new AppError("NOT_FOUND", "We couldn't find that menu item.");

    const before: Partial<Pick<AdminMenuItemView, "priceCents" | "isAvailable">> = {};
    const after: typeof before = {};
    if (input.priceCents !== undefined && input.priceCents !== current.priceCents) {
      before.priceCents = current.priceCents;
      after.priceCents = input.priceCents;
    }
    if (input.isAvailable !== undefined && input.isAvailable !== current.isAvailable) {
      before.isAvailable = current.isAvailable;
      after.isAvailable = input.isAvailable;
    }

    if (Object.keys(after).length > 0) {
      await tx
        .update(menuItems)
        .set({ ...after, updatedAt: new Date() })
        .where(eq(menuItems.id, current.id));
      await recordAudit(tx, {
        by: { kind: "ADMIN", actor: admin },
        action: "menu_item.update",
        targetType: "menu_item",
        targetId: current.id,
        metadata: { name: current.name, restaurantId: current.restaurantId, before, after },
        requestId,
      });
    }
    return {
      id: current.id,
      name: current.name,
      priceCents: after.priceCents ?? current.priceCents,
      isAvailable: after.isAvailable ?? current.isAvailable,
    };
  });
}
