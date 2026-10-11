import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listDropPoints } from "@/server/services/locations";

/** GET /api/v1/locations: campus drop points (docs/API_SPEC.md §5). Public. */
export const GET = withRoute({ auth: "public" }, async () => json({ data: await listDropPoints() }));
