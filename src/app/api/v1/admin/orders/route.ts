import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listAdminOrders } from "@/server/services/admin-orders";
import { adminOrdersQuerySchema } from "@/shared/schemas/admin";

/** GET /api/v1/admin/orders: every order, newest first, with filters (PRD ADM-6). */
export const GET = withRoute({ auth: "admin", query: adminOrdersQuerySchema }, async ({ query }) =>
  json(await listAdminOrders(query)),
);
