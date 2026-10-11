import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { getCourierProfile } from "@/server/services/courier";

/** GET /api/v1/courier/me: the caller's courier profile, or 404 if they never applied. */
export const GET = withRoute({ auth: "user" }, async ({ actor }) => json(await getCourierProfile(actor)));
