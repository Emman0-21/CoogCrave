import { ORDER_TRANSITION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { customerTransition } from "@/server/services/orders";
import { orderParamsSchema, transitionSchema } from "@/shared/schemas/ordering";

/** POST /api/v1/orders/{orderId}/transitions: status changes. Phase 4: customer cancel (PRD ORD-9). */
export const POST = withRoute(
  { auth: "user", params: orderParamsSchema, body: transitionSchema, rateLimits: [ORDER_TRANSITION_LIMIT] },
  async ({ actor, params, body }) => json(await customerTransition(actor, params.orderId, body)),
);
