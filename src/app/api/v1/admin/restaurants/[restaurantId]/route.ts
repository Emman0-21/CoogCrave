import { ADMIN_ACTION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { updateRestaurant } from "@/server/services/admin-catalog";
import { restaurantParamsSchema, restaurantPatchSchema } from "@/shared/schemas/admin";

/** PATCH /api/v1/admin/restaurants/{restaurantId}: open or close a restaurant for orders (PRD ADM-4). */
export const PATCH = withRoute(
  {
    auth: "admin",
    params: restaurantParamsSchema,
    body: restaurantPatchSchema,
    rateLimits: [ADMIN_ACTION_LIMIT],
  },
  async ({ actor, params, body, requestId }) =>
    json(await updateRestaurant(actor, params.restaurantId, body, requestId)),
);
