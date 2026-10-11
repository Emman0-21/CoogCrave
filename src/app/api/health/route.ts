import { checkHealth, defaultHealthDeps } from "@/server/health";
import { withRoute } from "@/server/http/route";

// Load balancers poll this often, so it is exempt from rate limits. It touches nothing but `select 1`.
export const GET = withRoute({ auth: "public", rateLimits: false }, ({ log }) =>
  checkHealth(defaultHealthDeps(), log),
);
