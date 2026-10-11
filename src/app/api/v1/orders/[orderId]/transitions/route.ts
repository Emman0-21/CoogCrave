import { ORDER_TRANSITION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { orderTransition } from "@/server/services/orders";
import { orderParamsSchema, transitionSchema } from "@/shared/schemas/ordering";

/** POST /api/v1/orders/{orderId}/transitions: every status change (customer, courier, Kitchen Console). */
export const POST = withRoute(
  { auth: "user", params: orderParamsSchema, body: transitionSchema, rateLimits: [ORDER_TRANSITION_LIMIT] },
  async ({ actor, params, body, requestId }) =>
    json(await orderTransition(actor, params.orderId, body, requestId)),
);
