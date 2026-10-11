import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { getMe, updateMe } from "@/server/services/profile";
import { updateProfileSchema } from "@/shared/schemas/profile";

/** GET /api/v1/me: the signed-in user's account (docs/API_SPEC.md §4). */
export const GET = withRoute({ auth: "user" }, async ({ actor }) => json(await getMe(actor)));

/** PATCH /api/v1/me: display name and default drop point. */
export const PATCH = withRoute(
  {
    auth: "user",
    body: updateProfileSchema,
    rateLimits: [{ by: "user", rule: { name: "api.profile_update.user", limit: 30, windowSeconds: 60 } }],
  },
  async ({ actor, body }) => json(await updateMe(actor, body)),
);
