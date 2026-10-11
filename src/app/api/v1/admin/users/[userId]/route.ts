import { ADMIN_ACTION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { setUserSuspension } from "@/server/services/admin-people";
import { suspendUserSchema, userParamsSchema } from "@/shared/schemas/admin";

/** PATCH /api/v1/admin/users/{userId}: suspend or unsuspend, with a reason (PRD ADM-3, THREAT_MODEL T-07). */
export const PATCH = withRoute(
  { auth: "admin", params: userParamsSchema, body: suspendUserSchema, rateLimits: [ADMIN_ACTION_LIMIT] },
  async ({ actor, params, body, requestId }) =>
    json(await setUserSuspension(actor, params.userId, body, requestId)),
);
