import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listOffers } from "@/server/services/courier";

/** GET /api/v1/courier/offers: deliveries ready for pickup, with no customer details (THREAT_MODEL T-05). */
export const GET = withRoute({ auth: "courier" }, async ({ actor }) =>
  json({ data: await listOffers(actor) }),
);
