import { CART_MUTATION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { removeCartItem, updateCartItemQuantity } from "@/server/services/cart";
import { cartItemParamsSchema, updateCartItemSchema } from "@/shared/schemas/ordering";

/** PATCH /api/v1/cart/items/{cartItemId}: change the quantity (PRD CART-3). */
export const PATCH = withRoute(
  {
    auth: "user",
    params: cartItemParamsSchema,
    body: updateCartItemSchema,
    rateLimits: [CART_MUTATION_LIMIT],
  },
  async ({ actor, params, body }) =>
    json(await updateCartItemQuantity(actor, params.cartItemId, body.quantity)),
);

/** DELETE /api/v1/cart/items/{cartItemId}: remove one line. */
export const DELETE = withRoute(
  { auth: "user", params: cartItemParamsSchema, rateLimits: [CART_MUTATION_LIMIT] },
  async ({ actor, params }) => json(await removeCartItem(actor, params.cartItemId)),
);
