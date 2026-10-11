import type { RouteRateLimit } from "./with-route";

/** Per-user limits for ordering endpoints (docs/API_SPEC.md §1). */
export const CART_MUTATION_LIMIT: RouteRateLimit = {
  by: "user",
  rule: { name: "api.cart_mutation.user", limit: 120, windowSeconds: 60 },
};

export const PLACE_ORDER_LIMIT: RouteRateLimit = {
  by: "user",
  rule: { name: "api.place_order.user", limit: 10, windowSeconds: 60 },
};

export const ORDER_TRANSITION_LIMIT: RouteRateLimit = {
  by: "user",
  rule: { name: "api.order_transition.user", limit: 60, windowSeconds: 60 },
};
