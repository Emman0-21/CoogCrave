import { COURIER_ACTION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { declineOffer } from "@/server/services/courier";
import { offerParamsSchema } from "@/shared/schemas/delivery";

/** POST /api/v1/courier/offers/{orderId}/decline: hide an offer from this courier (PRD DLV-4). */
export const POST = withRoute(
  { auth: "courier", params: offerParamsSchema, rateLimits: [COURIER_ACTION_LIMIT] },
  async ({ actor, params }) => {
    await declineOffer(actor, params.orderId);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  },
);
