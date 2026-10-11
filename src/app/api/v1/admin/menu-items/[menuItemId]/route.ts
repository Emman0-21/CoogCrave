import { ADMIN_ACTION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { updateMenuItem } from "@/server/services/admin-catalog";
import { menuItemParamsSchema, menuItemPatchSchema } from "@/shared/schemas/admin";

/** PATCH /api/v1/admin/menu-items/{menuItemId}: mark sold out or change the price (PRD ADM-5). */
export const PATCH = withRoute(
  {
    auth: "admin",
    params: menuItemParamsSchema,
    body: menuItemPatchSchema,
    rateLimits: [ADMIN_ACTION_LIMIT],
  },
  async ({ actor, params, body, requestId }) =>
    json(await updateMenuItem(actor, params.menuItemId, body, requestId)),
);
