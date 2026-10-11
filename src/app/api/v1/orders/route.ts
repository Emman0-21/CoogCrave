import { z } from "zod";

import { AppError } from "@/server/http/errors";
import { PLACE_ORDER_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { placeOrder } from "@/server/services/checkout";
import { listOrders } from "@/server/services/orders";
import { orderListQuerySchema, placeOrderSchema } from "@/shared/schemas/ordering";

const idempotencyKey = z.uuid();

/** GET /api/v1/orders: the caller's orders, newest first (PRD ORD-8). */
export const GET = withRoute({ auth: "user", query: orderListQuerySchema }, async ({ actor, query }) =>
  json(await listOrders(actor, query)),
);

/**
 * POST /api/v1/orders: place an order from the cart (PRD ORD-3…6). Requires an Idempotency-Key header
 * (a UUID made once per checkout attempt); a retry with the same key returns the first order with 200.
 */
export const POST = withRoute(
  { auth: "user", body: placeOrderSchema, rateLimits: [PLACE_ORDER_LIMIT] },
  async ({ actor, body, request }) => {
    const key = idempotencyKey.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Send an Idempotency-Key header (a UUID) with each order.",
      );
    }
    const { order, replayed } = await placeOrder(actor, body, key.data);
    return json(order, {
      status: replayed ? 200 : 201,
      headers: replayed ? { "idempotent-replayed": "true" } : undefined,
    });
  },
);
