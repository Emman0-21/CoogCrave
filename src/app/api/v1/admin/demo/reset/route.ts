import { z } from "zod";

import { AppError } from "@/server/http/errors";
import { DEMO_RESET_LIMIT } from "@/server/http/limits";
import { withRoute } from "@/server/http/route";
import { json } from "@/server/http/respond";
import { demoResetAvailable, resetDemo } from "@/server/services/admin-ops";
import { DEMO_RESET_PHRASE, demoResetSchema } from "@/shared/schemas/admin";

/**
 * POST /api/v1/admin/demo/reset (PRD ADM-10, THREAT_MODEL T-29). Answers 404 unless APP_ENV isn't
 * production and DEMO_RESET_ENABLED=true. Availability is checked before the confirmation phrase, so
 * where reset is off, the endpoint looks the same as one that doesn't exist.
 */
export const POST = withRoute(
  { auth: "admin", body: z.unknown(), rateLimits: [DEMO_RESET_LIMIT] },
  async ({ actor, body, requestId }) => {
    if (!demoResetAvailable()) throw new AppError("NOT_FOUND", "Resource not found.");
    if (!demoResetSchema.safeParse(body).success) {
      throw new AppError("VALIDATION_ERROR", `Type ${DEMO_RESET_PHRASE} to confirm.`, [
        { path: "confirm", message: `Type ${DEMO_RESET_PHRASE} to confirm.` },
      ]);
    }
    return json(await resetDemo(actor, requestId));
  },
);
