import { CART_MUTATION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { addCartItem } from "@/server/services/cart";
import { addCartItemSchema } from "@/shared/schemas/ordering";

/** POST /api/v1/cart/items: add an item with its options (PRD CART-1, CART-2). */
export const POST = withRoute(
  { auth: "user", body: addCartItemSchema, rateLimits: [CART_MUTATION_LIMIT] },
  async ({ actor, body }) => json(await addCartItem(actor, body), { status: 201 }),
);
