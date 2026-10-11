import "server-only";

import { and, asc, eq, exists, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";

import { type Database, type DbExecutor, getDb } from "@/server/db/client";
import {
  campuses,
  campusLocations,
  cuisines,
  menuCategories,
  menuItems,
  menuOptionGroups,
  menuOptions,
  restaurantCuisines,
  restaurantHours,
  restaurants,
} from "@/server/db/schema";
import { type HoursRange, openStatus } from "@/server/domain/hours";
import { AppError } from "@/server/http/errors";
import type {
  CuisineView,
  MenuOptionGroupView,
  RestaurantDetail,
  RestaurantListQuery,
  RestaurantSummary,
} from "@/shared/schemas/ordering";

/**
 * Restaurant discovery (PRD CAT-1…6). Public data: no customer information is read here.
 *
 * Open/closed is computed in the application from weekly hours in the campus time zone, because the
 * rules (midnight-crossing ranges, daylight-saving changes) live in the pure hours module and are
 * unit-tested there. A campus has tens of restaurants, so the list isn't paginated (API_SPEC §5).
 */

/** Escapes LIKE wildcards so a search for "50%" matches the text "50%", not everything. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const activeRestaurant = isNull(restaurants.deletedAt);

type OpenFields = Pick<
  RestaurantSummary,
  "isOpenNow" | "closesAtMinute" | "nextOpenAt" | "isAcceptingOrders" | "canOrder"
>;

/** Open status by the restaurant's hours, and whether it can take an order right now. */
export function restaurantOpenStatus(
  hours: readonly HoursRange[],
  isAcceptingOrders: boolean,
  timeZone: string,
  now: Date,
): OpenFields {
  const status = openStatus(hours, now, timeZone);
  return {
    isOpenNow: status.isOpen,
    closesAtMinute: status.closesAtMinute,
    nextOpenAt: status.nextOpenAt?.toISOString() ?? null,
    isAcceptingOrders,
    canOrder: status.isOpen && isAcceptingOrders,
  };
}

const summaryColumns = {
  id: restaurants.id,
  slug: restaurants.slug,
  name: restaurants.name,
  description: restaurants.description,
  pickupNotes: restaurants.pickupNotes,
  isAcceptingOrders: restaurants.isAcceptingOrders,
  isSampleData: restaurants.isSampleData,
  timezone: campuses.timezone,
  locationId: campusLocations.id,
  locationName: campusLocations.name,
  locationShortName: campusLocations.shortName,
};

interface SummaryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isAcceptingOrders: boolean;
  isSampleData: boolean;
  timezone: string;
  locationId: string;
  locationName: string;
  locationShortName: string;
}

function groupBy<T extends { key: string }>(rows: readonly T[]): Map<string, Omit<T, "key">[]> {
  const map = new Map<string, Omit<T, "key">[]>();
  for (const { key, ...rest } of rows) {
    const list = map.get(key) ?? [];
    list.push(rest);
    map.set(key, list);
  }
  return map;
}

/** Weekly hours for restaurants, keyed by restaurant ID, in day and time order. */
export async function hoursByRestaurant(
  db: DbExecutor,
  restaurantIds: string[],
): Promise<Map<string, HoursRange[]>> {
  if (restaurantIds.length === 0) return new Map();
  const rows = await db
    .select({
      key: restaurantHours.restaurantId,
      dayOfWeek: restaurantHours.dayOfWeek,
      opensAtMinute: restaurantHours.opensAtMinute,
      closesAtMinute: restaurantHours.closesAtMinute,
    })
    .from(restaurantHours)
    .where(inArray(restaurantHours.restaurantId, restaurantIds))
    .orderBy(asc(restaurantHours.dayOfWeek), asc(restaurantHours.opensAtMinute));
  return groupBy(rows);
}

async function cuisinesByRestaurant(
  db: DbExecutor,
  restaurantIds: string[],
): Promise<Map<string, CuisineView[]>> {
  if (restaurantIds.length === 0) return new Map();
  const rows = await db
    .select({ key: restaurantCuisines.restaurantId, slug: cuisines.slug, name: cuisines.name })
    .from(restaurantCuisines)
    .innerJoin(cuisines, eq(cuisines.id, restaurantCuisines.cuisineId))
    .where(inArray(restaurantCuisines.restaurantId, restaurantIds))
    .orderBy(asc(cuisines.name));
  return groupBy(rows);
}

/** Up to three menu item names per restaurant that match the search, to show why it matched. */
async function matchingItemNames(
  db: DbExecutor,
  restaurantIds: string[],
  q: string,
): Promise<Map<string, string[]>> {
  const byRestaurant = new Map<string, string[]>();
  if (restaurantIds.length === 0) return byRestaurant;
  const rows = await db
    .select({ restaurantId: menuItems.restaurantId, name: menuItems.name })
    .from(menuItems)
    .where(
      and(
        inArray(menuItems.restaurantId, restaurantIds),
        isNull(menuItems.deletedAt),
        ilike(menuItems.name, likePattern(q)),
      ),
    )
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));
  for (const row of rows) {
    const list = byRestaurant.get(row.restaurantId) ?? [];
    if (list.length < 3) list.push(row.name);
    byRestaurant.set(row.restaurantId, list);
  }
  return byRestaurant;
}

function toSummary(
  row: SummaryRow,
  hours: readonly HoursRange[],
  cuisineList: CuisineView[],
  matchingItems: string[],
  now: Date,
): RestaurantSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    cuisines: cuisineList,
    location: { id: row.locationId, name: row.locationName, shortName: row.locationShortName },
    isSampleData: row.isSampleData,
    matchingItems,
    ...restaurantOpenStatus(hours, row.isAcceptingOrders, row.timezone, now),
  };
}

/** GET /api/v1/restaurants: restaurants taking orders first, then the rest; alphabetical within each. */
export async function listRestaurants(
  query: RestaurantListQuery,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<RestaurantSummary[]> {
  const filters: SQL[] = [activeRestaurant];

  if (query.q) {
    const pattern = likePattern(query.q);
    const matchingItem = db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(
        and(
          eq(menuItems.restaurantId, restaurants.id),
          isNull(menuItems.deletedAt),
          ilike(menuItems.name, pattern),
        ),
      );
    filters.push(
      or(ilike(restaurants.name, pattern), ilike(restaurants.description, pattern), exists(matchingItem))!,
    );
  }

  if (query.cuisine && query.cuisine.length > 0) {
    const inCuisine = db
      .select({ id: restaurantCuisines.cuisineId })
      .from(restaurantCuisines)
      .innerJoin(cuisines, eq(cuisines.id, restaurantCuisines.cuisineId))
      .where(and(eq(restaurantCuisines.restaurantId, restaurants.id), inArray(cuisines.slug, query.cuisine)));
    filters.push(exists(inCuisine));
  }

  const rows = await db
    .select(summaryColumns)
    .from(restaurants)
    .innerJoin(campuses, eq(campuses.id, restaurants.campusId))
    .innerJoin(campusLocations, eq(campusLocations.id, restaurants.locationId))
    .where(and(...filters))
    .orderBy(asc(restaurants.name));

  const ids = rows.map((r) => r.id);
  const [hours, cuisineMap, matches] = await Promise.all([
    hoursByRestaurant(db, ids),
    cuisinesByRestaurant(db, ids),
    query.q ? matchingItemNames(db, ids, query.q) : Promise.resolve(new Map<string, string[]>()),
  ]);

  const summaries = rows.map((row) =>
    toSummary(row, hours.get(row.id) ?? [], cuisineMap.get(row.id) ?? [], matches.get(row.id) ?? [], now),
  );
  const visible = query.openNow ? summaries.filter((r) => r.canOrder) : summaries;
  // Array.prototype.sort is stable, so each group stays alphabetical.
  return visible.sort((a, b) => Number(b.canOrder) - Number(a.canOrder));
}

/** GET /api/v1/cuisines: cuisines that at least one active restaurant has. */
export async function listCuisines(db: Database = getDb()): Promise<CuisineView[]> {
  return db
    .selectDistinct({ slug: cuisines.slug, name: cuisines.name })
    .from(cuisines)
    .innerJoin(restaurantCuisines, eq(restaurantCuisines.cuisineId, cuisines.id))
    .innerJoin(restaurants, eq(restaurants.id, restaurantCuisines.restaurantId))
    .where(activeRestaurant)
    .orderBy(asc(cuisines.name));
}

/** GET /api/v1/restaurants/{slug}: summary, hours, and the active menu. Unknown or deleted → 404. */
export async function getRestaurant(
  slug: string,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<RestaurantDetail> {
  const [row] = await db
    .select(summaryColumns)
    .from(restaurants)
    .innerJoin(campuses, eq(campuses.id, restaurants.campusId))
    .innerJoin(campusLocations, eq(campusLocations.id, restaurants.locationId))
    .where(and(eq(restaurants.slug, slug), activeRestaurant));
  if (!row) throw new AppError("NOT_FOUND", "We couldn't find that restaurant.");

  const [hours, cuisineMap, menu] = await Promise.all([
    hoursByRestaurant(db, [row.id]),
    cuisinesByRestaurant(db, [row.id]),
    loadMenu(db, row.id),
  ]);
  const weeklyHours = hours.get(row.id) ?? [];
  return {
    ...toSummary(row, weeklyHours, cuisineMap.get(row.id) ?? [], [], now),
    pickupNotes: row.pickupNotes,
    timeZone: row.timezone,
    hours: weeklyHours,
    menu,
  };
}

async function loadMenu(db: DbExecutor, restaurantId: string): Promise<RestaurantDetail["menu"]> {
  const [categoryRows, itemRows] = await Promise.all([
    db
      .select({ id: menuCategories.id, name: menuCategories.name })
      .from(menuCategories)
      .where(and(eq(menuCategories.restaurantId, restaurantId), isNull(menuCategories.deletedAt)))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name)),
    db
      .select({
        id: menuItems.id,
        categoryId: menuItems.categoryId,
        name: menuItems.name,
        description: menuItems.description,
        priceCents: menuItems.priceCents,
        isAvailable: menuItems.isAvailable,
      })
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, restaurantId), isNull(menuItems.deletedAt)))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.name)),
  ]);

  const groups = await loadOptionGroups(
    db,
    itemRows.map((i) => i.id),
  );

  return categoryRows
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      items: itemRows
        .filter((item) => item.categoryId === category.id)
        .map(({ categoryId: _categoryId, ...item }) => ({
          ...item,
          optionGroups: groups.get(item.id) ?? [],
        })),
    }))
    .filter((category) => category.items.length > 0);
}

/** Active option groups and their active options, keyed by menu item ID, in menu order. */
export async function loadOptionGroups(
  db: DbExecutor,
  menuItemIds: string[],
): Promise<Map<string, MenuOptionGroupView[]>> {
  const byItem = new Map<string, MenuOptionGroupView[]>();
  if (menuItemIds.length === 0) return byItem;
  const rows = await db
    .select({
      menuItemId: menuOptionGroups.menuItemId,
      groupId: menuOptionGroups.id,
      groupName: menuOptionGroups.name,
      minSelect: menuOptionGroups.minSelect,
      maxSelect: menuOptionGroups.maxSelect,
      optionId: menuOptions.id,
      optionName: menuOptions.name,
      priceDeltaCents: menuOptions.priceDeltaCents,
      isAvailable: menuOptions.isAvailable,
    })
    .from(menuOptionGroups)
    .leftJoin(
      menuOptions,
      and(eq(menuOptions.optionGroupId, menuOptionGroups.id), isNull(menuOptions.deletedAt)),
    )
    .where(and(inArray(menuOptionGroups.menuItemId, menuItemIds), isNull(menuOptionGroups.deletedAt)))
    .orderBy(
      asc(menuOptionGroups.sortOrder),
      asc(menuOptionGroups.name),
      asc(menuOptions.sortOrder),
      asc(menuOptions.name),
    );

  for (const row of rows) {
    const groups = byItem.get(row.menuItemId) ?? [];
    let group = groups.find((g) => g.id === row.groupId);
    if (!group) {
      group = {
        id: row.groupId,
        name: row.groupName,
        minSelect: row.minSelect,
        maxSelect: row.maxSelect,
        options: [],
      };
      groups.push(group);
    }
    if (row.optionId !== null && row.optionName !== null) {
      group.options.push({
        id: row.optionId,
        name: row.optionName,
        priceDeltaCents: row.priceDeltaCents ?? 0,
        isAvailable: row.isAvailable ?? false,
      });
    }
    byItem.set(row.menuItemId, groups);
  }
  return byItem;
}
