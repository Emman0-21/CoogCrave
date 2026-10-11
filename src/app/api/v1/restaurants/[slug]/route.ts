import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { getRestaurant } from "@/server/services/catalog";
import { restaurantSlugParamsSchema } from "@/shared/schemas/ordering";

/** GET /api/v1/restaurants/{slug}: hours and menu (PRD CAT-4). Public. */
export const GET = withRoute({ auth: "public", params: restaurantSlugParamsSchema }, async ({ params }) =>
  json(await getRestaurant(params.slug)),
);
