import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { type Database, getDb } from "@/server/db/client";
import { campusLocations } from "@/server/db/schema";
import type { LocationResponse } from "@/shared/schemas/profile";

/** GET /api/v1/locations: active campus drop points, in display order. Public data. */
export async function listDropPoints(db: Database = getDb()): Promise<LocationResponse[]> {
  return db
    .select({
      id: campusLocations.id,
      name: campusLocations.name,
      shortName: campusLocations.shortName,
      description: campusLocations.description,
    })
    .from(campusLocations)
    .where(and(eq(campusLocations.isDropPoint, true), isNull(campusLocations.deletedAt)))
    .orderBy(asc(campusLocations.sortOrder), asc(campusLocations.name));
}
