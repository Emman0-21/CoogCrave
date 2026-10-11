import { z } from "zod";

import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listAuditEvents } from "@/server/services/audit";

const query = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
  targetType: z.string().max(40).optional(),
  targetId: z.string().max(100).optional(),
  actorUserId: z.uuid().optional(),
});

/** GET /api/v1/admin/audit-events: append-only admin action log, newest first (PRD ADM-9). */
export const GET = withRoute({ auth: "admin", query }, async ({ query: q }) =>
  json(await listAuditEvents(q)),
);
