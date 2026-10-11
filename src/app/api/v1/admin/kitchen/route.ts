import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listKitchenOrders } from "@/server/services/kitchen";

/** GET /api/v1/admin/kitchen: orders for the Kitchen Console (simulated restaurant actions). Admins only. */
export const GET = withRoute({ auth: "admin" }, async () => json({ data: await listKitchenOrders() }));
