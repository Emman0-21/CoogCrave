import "server-only";

import { getActorFromHeaders } from "@/server/auth/session";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { logger } from "@/server/logger";
import { PostgresRateLimiter, type RateLimiter } from "@/server/rate-limit/rate-limiter";

import { createRouteWrapper } from "./with-route";

let limiter: RateLimiter | undefined;

/** The app's rate limiter, created on first use so builds don't need a database. */
export function getRateLimiter(): RateLimiter {
  limiter ??= new PostgresRateLimiter(getDb());
  return limiter;
}

/** The withRoute every /api/v1 route handler uses. */
export const withRoute = createRouteWrapper({
  getAppOrigin: () => getConfig().appOrigin,
  logger,
  getActor: (request) => getActorFromHeaders(request.headers),
  rateLimiter: { consume: (rule, subject) => getRateLimiter().consume(rule, subject) },
});
