import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listNotifications } from "@/server/services/notifications";
import { notificationsQuerySchema } from "@/shared/schemas/engagement";

/** GET /api/v1/notifications: the caller's notifications, newest first, with the unread count (PRD NTF-2). */
export const GET = withRoute({ auth: "user", query: notificationsQuerySchema }, async ({ actor, query }) =>
  json(await listNotifications(actor.userId, query)),
);
