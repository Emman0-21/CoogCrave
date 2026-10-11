import { CART_MUTATION_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { quote } from "@/server/services/checkout";
import { quoteSchema } from "@/shared/schemas/ordering";

/** POST /api/v1/checkout/quote: price breakdown for the cart (PRD ORD-1). Read-only. */
export const POST = withRoute(
  { auth: "user", body: quoteSchema, rateLimits: [CART_MUTATION_LIMIT] },
  async ({ actor, body }) => json(await quote(actor, body)),
);
