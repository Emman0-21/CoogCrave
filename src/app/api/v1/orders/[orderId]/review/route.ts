import { REVIEW_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { createReview } from "@/server/services/reviews";
import { reviewSchema } from "@/shared/schemas/engagement";
import { orderParamsSchema } from "@/shared/schemas/ordering";

/** POST /api/v1/orders/{orderId}/review: rate a delivered order once (PRD REV-1, REV-2). */
export const POST = withRoute(
  { auth: "user", params: orderParamsSchema, body: reviewSchema, rateLimits: [REVIEW_LIMIT] },
  async ({ actor, params, body }) => json(await createReview(actor, params.orderId, body), { status: 201 }),
);
