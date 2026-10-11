import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { listCuisines } from "@/server/services/catalog";

/** GET /api/v1/cuisines: filter options (cuisines with at least one active restaurant). Public. */
export const GET = withRoute({ auth: "public" }, async () => json({ data: await listCuisines() }));
