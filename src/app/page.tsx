import { Landing } from "@/components/features/landing/landing";
import { getCurrentActor } from "@/server/auth/session";

export default async function HomePage() {
  const actor = await getCurrentActor();
  return <Landing signedIn={Boolean(actor && !actor.suspended)} />;
}
