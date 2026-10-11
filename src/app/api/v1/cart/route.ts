import { CART_MUTATION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { clearCart, getCart } from "@/server/services/cart";

/** GET /api/v1/cart: the caller's cart with live prices (PRD CART-4). */
export const GET = withRoute({ auth: "user" }, async ({ actor }) => json(await getCart(actor)));

/** DELETE /api/v1/cart: empty the cart. */
export const DELETE = withRoute({ auth: "user", rateLimits: [CART_MUTATION_LIMIT] }, async ({ actor }) =>
  json(await clearCart(actor)),
);
