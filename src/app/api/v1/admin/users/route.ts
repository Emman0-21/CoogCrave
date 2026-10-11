import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listUsers } from "@/server/services/admin-people";
import { adminUsersQuerySchema } from "@/shared/schemas/admin";

/** GET /api/v1/admin/users: everyone, newest first, searchable (PRD ADM-3). */
export const GET = withRoute({ auth: "admin", query: adminUsersQuerySchema }, async ({ query }) =>
  json(await listUsers(query)),
);
