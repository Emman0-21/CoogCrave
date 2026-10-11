import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listCouriers } from "@/server/services/admin-people";
import { adminCouriersQuerySchema } from "@/shared/schemas/admin";

/** GET /api/v1/admin/couriers: courier profiles, oldest application first (PRD ADM-2). */
export const GET = withRoute({ auth: "admin", query: adminCouriersQuerySchema }, async ({ query }) =>
  json({ data: await listCouriers(query.status) }),
);
