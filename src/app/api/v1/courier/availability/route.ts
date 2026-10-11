import { COURIER_ACTION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { setAvailability } from "@/server/services/courier";
import { availabilitySchema } from "@/shared/schemas/delivery";

/** PUT /api/v1/courier/availability: go online or offline (PRD DLV-2). Approved couriers only. */
export const PUT = withRoute(
  { auth: "courier", body: availabilitySchema, rateLimits: [COURIER_ACTION_LIMIT] },
  async ({ actor, body }) => json(await setAvailability(actor, body.online)),
);
