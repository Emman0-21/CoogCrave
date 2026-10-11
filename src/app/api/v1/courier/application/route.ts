import { COURIER_ACTION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { applyAsCourier } from "@/server/services/courier";
import { courierApplicationSchema } from "@/shared/schemas/delivery";

/** POST /api/v1/courier/application: apply to deliver (PRD DLV-1). Always starts PENDING. */
export const POST = withRoute(
  { auth: "user", body: courierApplicationSchema, rateLimits: [COURIER_ACTION_LIMIT] },
  async ({ actor, body }) => json(await applyAsCourier(actor, body), { status: 201 }),
);
