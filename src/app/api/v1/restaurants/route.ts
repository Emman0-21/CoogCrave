import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listRestaurants } from "@/server/services/catalog";
import { restaurantListQuerySchema } from "@/shared/schemas/ordering";

/** GET /api/v1/restaurants: browse, search, and filter (PRD CAT-1…3). Public. */
export const GET = withRoute({ auth: "public", query: restaurantListQuerySchema }, async ({ query }) =>
  json({ data: await listRestaurants(query) }),
);
