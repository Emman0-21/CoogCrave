import "server-only";

import type { Logger } from "pino";

import { pingDatabase } from "@/server/db/client";
import { json } from "@/server/http/respond";

export interface HealthDeps {
  pingDatabase: () => Promise<void>;
  version: string;
}

export function defaultHealthDeps(): HealthDeps {
  return { pingDatabase: () => pingDatabase(), version: process.env.GIT_SHA ?? "dev" };
}

/**
 * GET /api/health — liveness plus a database round trip, used by deployment smoke tests.
 * Reports only status words and the build version: no hostnames, config, or error text.
 */
export async function checkHealth(deps: HealthDeps, log: Logger): Promise<Response> {
  try {
    await deps.pingDatabase();
    return json({ status: "ok", db: "ok", version: deps.version });
  } catch (error) {
    log.warn({ err: error }, "health check: database unreachable");
    return json({ status: "degraded", db: "error", version: deps.version }, { status: 503 });
  }
}
