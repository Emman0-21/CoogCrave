import "server-only";

import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import * as s from "@/server/db/schema";

import { CAMPUS, CUISINES, LOCATIONS, RESTAURANTS } from "./catalog-data";
import { seedId } from "./ids";

export interface CatalogSummary {
  campuses: number;
  locations: number;
  cuisines: number;
  restaurants: number;
  menuItems: number;
}

/**
 * Idempotent catalog seed (docs/DATABASE_DESIGN.md §7): campus, drop points, cuisines, sample
 * restaurants with hours and menus. Every insert updates the existing row on conflict, so running it
 * twice changes nothing. Runs in one transaction as the app role (DML only).
 */
export async function seedCatalog(db: Database): Promise<CatalogSummary> {
  return db.transaction(async (tx) => {
    const campusId = seedId(`campus:${CAMPUS.key}`);
    const { key: _campusKey, ...campus } = CAMPUS;
    await tx
      .insert(s.campuses)
      .values({ id: campusId, ...campus })
      .onConflictDoUpdate({ target: s.campuses.id, set: { ...campus, updatedAt: new Date() } });

    for (const [index, location] of LOCATIONS.entries()) {
      const values = {
        campusId,
        name: location.name,
        shortName: location.shortName,
        description: location.description,
        isDropPoint: location.isDropPoint,
        sortOrder: index,
        deletedAt: null,
      };
      await tx
        .insert(s.campusLocations)
        .values({ id: seedId(`location:${location.key}`), ...values })
        .onConflictDoUpdate({ target: s.campusLocations.id, set: { ...values, updatedAt: new Date() } });
    }

    for (const cuisine of CUISINES) {
      await tx
        .insert(s.cuisines)
        .values({ id: seedId(`cuisine:${cuisine.key}`), slug: cuisine.key, name: cuisine.name })
        .onConflictDoUpdate({ target: s.cuisines.id, set: { name: cuisine.name } });
    }

    let menuItems = 0;
    for (const restaurant of RESTAURANTS) {
      const restaurantId = seedId(`restaurant:${restaurant.key}`);
      const values = {
        campusId,
        locationId: seedId(`location:${restaurant.pickupLocation}`),
        slug: restaurant.slug,
        name: restaurant.name,
        description: restaurant.description,
        pickupNotes: restaurant.pickupNotes,
        isAcceptingOrders: true,
        isSampleData: true,
        deletedAt: null,
      };
      await tx
        .insert(s.restaurants)
        .values({ id: restaurantId, ...values })
        .onConflictDoUpdate({ target: s.restaurants.id, set: { ...values, updatedAt: new Date() } });

      // Cuisines and hours are replaced wholesale: the data file is the source of truth.
      await tx.delete(s.restaurantCuisines).where(eq(s.restaurantCuisines.restaurantId, restaurantId));
      await tx
        .insert(s.restaurantCuisines)
        .values(restaurant.cuisines.map((key) => ({ restaurantId, cuisineId: seedId(`cuisine:${key}`) })));
      await tx.delete(s.restaurantHours).where(eq(s.restaurantHours.restaurantId, restaurantId));
      const hours = restaurant.week.flatMap((slot, dayOfWeek) =>
        slot ? [{ restaurantId, dayOfWeek, opensAtMinute: slot[0], closesAtMinute: slot[1] }] : [],
      );
      if (hours.length) await tx.insert(s.restaurantHours).values(hours);

      for (const [ci, category] of restaurant.categories.entries()) {
        const categoryId = seedId(`category:${restaurant.key}:${category.key}`);
        const categoryValues = { restaurantId, name: category.name, sortOrder: ci, deletedAt: null };
        await tx
          .insert(s.menuCategories)
          .values({ id: categoryId, ...categoryValues })
          .onConflictDoUpdate({
            target: s.menuCategories.id,
            set: { ...categoryValues, updatedAt: new Date() },
          });

        for (const [ii, item] of category.items.entries()) {
          const itemId = seedId(`item:${restaurant.key}:${item.key}`);
          const itemValues = {
            restaurantId,
            categoryId,
            name: item.name,
            description: item.description,
            priceCents: item.priceCents,
            isAvailable: item.isAvailable ?? true,
            sortOrder: ii,
            deletedAt: null,
          };
          await tx
            .insert(s.menuItems)
            .values({ id: itemId, ...itemValues })
            .onConflictDoUpdate({ target: s.menuItems.id, set: { ...itemValues, updatedAt: new Date() } });
          menuItems++;

          for (const [gi, group] of (item.optionGroups ?? []).entries()) {
            const groupId = seedId(`option-group:${restaurant.key}:${item.key}:${group.key}`);
            const groupValues = {
              menuItemId: itemId,
              name: group.name,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              sortOrder: gi,
              deletedAt: null,
            };
            await tx
              .insert(s.menuOptionGroups)
              .values({ id: groupId, ...groupValues })
              .onConflictDoUpdate({
                target: s.menuOptionGroups.id,
                set: { ...groupValues, updatedAt: new Date() },
              });

            for (const [oi, option] of group.options.entries()) {
              const optionValues = {
                optionGroupId: groupId,
                name: option.name,
                priceDeltaCents: option.priceDeltaCents,
                isAvailable: true,
                sortOrder: oi,
                deletedAt: null,
              };
              await tx
                .insert(s.menuOptions)
                .values({
                  id: seedId(`option:${restaurant.key}:${item.key}:${group.key}:${option.key}`),
                  ...optionValues,
                })
                .onConflictDoUpdate({
                  target: s.menuOptions.id,
                  set: { ...optionValues, updatedAt: new Date() },
                });
            }
          }
        }
      }
    }

    return {
      campuses: 1,
      locations: LOCATIONS.length,
      cuisines: CUISINES.length,
      restaurants: RESTAURANTS.length,
      menuItems,
    };
  });
}
