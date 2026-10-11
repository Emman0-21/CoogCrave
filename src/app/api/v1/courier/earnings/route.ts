import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { getEarnings } from "@/server/services/courier";

/** GET /api/v1/courier/earnings: SIMULATED earnings and stats (PRD DLV-10, DLV-11). */
export const GET = withRoute({ auth: "courier" }, async ({ actor }) => json(await getEarnings(actor)));
