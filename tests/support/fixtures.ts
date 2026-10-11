import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import * as schema from "@/server/db/schema";

/**
 * Minimal, valid rows for integration tests. Each builder fills required columns with sensible values
 * and accepts overrides. Inserts run as whichever role the pool connects with (normally the app role).
 */

export type TestDb = NodePgDatabase<typeof schema>;

export function testDb(pool: Pool): TestDb {
  return drizzle(pool, { schema });
}

let counter = 0;
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export async function createCampus(db: TestDb, overrides: Partial<typeof schema.campuses.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.campuses)
    .values({
      slug: unique("campus"),
      name: "Test Campus",
      timezone: "America/Chicago",
      deliveryFeeCents: 249,
      serviceFeeBps: 500,
      serviceFeeMinCents: 50,
      serviceFeeMaxCents: 300,
      taxRateBps: 825,
      minSubtotalCents: 500,
      maxTipCents: 5000,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function createLocation(
  db: TestDb,
  campusId: string,
  overrides: Partial<typeof schema.campusLocations.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.campusLocations)
    .values({ campusId, name: unique("Building"), shortName: "Bldg", ...overrides })
    .returning();
  return row!;
}

export async function createUser(db: TestDb, overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.users)
    .values({
      name: "Test Student",
      email: `${unique("student")}@cougarnet.uh.edu`,
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function createRestaurantWithItem(db: TestDb, campusId: string, locationId: string) {
  const [restaurant] = await db
    .insert(schema.restaurants)
    .values({ campusId, locationId, slug: unique("restaurant"), name: "Test Kitchen" })
    .returning();
  const [category] = await db
    .insert(schema.menuCategories)
    .values({ restaurantId: restaurant!.id, name: "Mains" })
    .returning();
  const [item] = await db
    .insert(schema.menuItems)
    .values({ restaurantId: restaurant!.id, categoryId: category!.id, name: "Test Burger", priceCents: 899 })
    .returning();
  return { restaurant: restaurant!, category: category!, item: item! };
}

export async function createCourier(
  db: TestDb,
  userId: string,
  overrides: Partial<typeof schema.courierProfiles.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.courierProfiles)
    .values({ userId, transportMode: "WALK", guidelinesAcceptedAt: new Date(), ...overrides })
    .returning();
  return row!;
}

/** An order whose amounts satisfy the total CHECK: 899 + 249 + 50 + 78 + 0 = 1276. */
export function validOrderValues(args: {
  customerId: string;
  campusId: string;
  restaurantId: string;
  locationId: string;
}): typeof schema.orders.$inferInsert {
  return {
    orderNumber: `CC-${Math.random().toString(36).slice(2, 9).toUpperCase().padEnd(7, "0")}`,
    customerId: args.customerId,
    campusId: args.campusId,
    restaurantId: args.restaurantId,
    restaurantNameSnapshot: "Test Kitchen",
    deliveryLocationId: args.locationId,
    deliveryLocationSnapshot: "Test Building",
    subtotalCents: 899,
    deliveryFeeCents: 249,
    serviceFeeCents: 50,
    taxCents: 78,
    tipCents: 0,
    totalCents: 1276,
    idempotencyKey: crypto.randomUUID(),
    requestHash: "a".repeat(64),
  };
}

/** A campus, a drop point, a restaurant with one item, and a verified student: enough for most tests. */
export async function createWorld(db: TestDb) {
  const campus = await createCampus(db);
  const location = await createLocation(db, campus.id);
  const { restaurant, category, item } = await createRestaurantWithItem(db, campus.id, location.id);
  const customer = await createUser(db);
  return { campus, location, restaurant, category, item, customer };
}
