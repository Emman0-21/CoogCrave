import { ADMIN_ACTION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { decideCourier } from "@/server/services/admin-people";
import { courierDecisionSchema, courierParamsSchema } from "@/shared/schemas/admin";

/** POST /api/v1/admin/couriers/{courierId}/decision: approve, reject, suspend, or reinstate (PRD ADM-2). */
export const POST = withRoute(
  {
    auth: "admin",
    params: courierParamsSchema,
    body: courierDecisionSchema,
    rateLimits: [ADMIN_ACTION_LIMIT],
  },
  async ({ actor, params, body, requestId }) =>
    json(await decideCourier(actor, params.courierId, body, requestId)),
);
