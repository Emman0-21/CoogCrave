import { checkHealth, defaultHealthDeps } from "@/server/health";
import { withRoute } from "@/server/http/with-route";

export const GET = withRoute({}, ({ log }) => checkHealth(defaultHealthDeps(), log));
