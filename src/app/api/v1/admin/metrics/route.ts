import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { getMetrics } from "@/server/services/admin-ops";

/** GET /api/v1/admin/metrics: today's numbers for the admin dashboard (PRD ADM-1). */
export const GET = withRoute({ auth: "admin" }, async () => json(await getMetrics()));
