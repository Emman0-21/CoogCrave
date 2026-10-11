import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { getOrder } from "@/server/services/orders";
import { orderParamsSchema } from "@/shared/schemas/ordering";

/** GET /api/v1/orders/{orderId}: tracking detail; only for the customer who placed it (THREAT_MODEL T-01). */
export const GET = withRoute({ auth: "user", params: orderParamsSchema }, async ({ actor, params }) =>
  json(await getOrder(actor, params.orderId)),
);
