import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listDeliveries } from "@/server/services/courier";
import { deliveriesQuerySchema } from "@/shared/schemas/delivery";

/** GET /api/v1/courier/deliveries: this courier's delivery history (PRD DLV-10). */
export const GET = withRoute({ auth: "courier", query: deliveriesQuerySchema }, async ({ actor, query }) =>
  json({ data: await listDeliveries(actor, query.limit) }),
);
