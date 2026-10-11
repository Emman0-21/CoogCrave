import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { getOrderForViewer } from "@/server/services/orders";
import { orderParamsSchema } from "@/shared/schemas/ordering";

/** GET /api/v1/orders/{orderId}: the customer's or the assigned courier's view; 404 for anyone else (T-01, T-05). */
export const GET = withRoute({ auth: "user", params: orderParamsSchema }, async ({ actor, params }) =>
  json(await getOrderForViewer(actor, params.orderId)),
);
