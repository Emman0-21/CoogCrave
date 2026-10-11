import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listRestaurants } from "@/server/services/catalog";

/** GET /api/v1/admin/restaurants: every active restaurant, including ones not taking orders (PRD ADM-4). */
export const GET = withRoute({ auth: "admin" }, async () => json({ data: await listRestaurants({}) }));
