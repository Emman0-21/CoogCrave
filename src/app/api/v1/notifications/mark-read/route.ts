import { NOTIFICATION_READ_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { markNotificationsRead } from "@/server/services/notifications";
import { markReadSchema } from "@/shared/schemas/engagement";

/** POST /api/v1/notifications/mark-read: some or all of the caller's notifications (PRD NTF-2). */
export const POST = withRoute(
  { auth: "user", body: markReadSchema, rateLimits: [NOTIFICATION_READ_LIMIT] },
  async ({ actor, body }) => {
    await markNotificationsRead(actor.userId, body);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  },
);
