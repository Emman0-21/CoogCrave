import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { getActiveDelivery } from "@/server/services/courier";

/** GET /api/v1/courier/deliveries/active: the current delivery, or 204 when there isn't one. */
export const GET = withRoute({ auth: "courier" }, async ({ actor }) => {
  const active = await getActiveDelivery(actor);
  return active
    ? json(active)
    : new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
});
