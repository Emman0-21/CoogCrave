/**
 * Runs once when the server starts (Next.js instrumentation). The only job today: start the demo
 * auto-advance loop when it's switched on. Imported lazily so nothing server-side loads in other
 * runtimes, and so it's skipped entirely unless the flag is set.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DEMO_AUTO_ADVANCE !== "true") return;
  const [{ autoAdvanceEnabled, startAutoAdvance }, { logger }] = await Promise.all([
    import("@/server/demo/auto-advance"),
    import("@/server/logger"),
  ]);
  // getConfig() inside validates the whole environment and refuses this flag in production.
  if (autoAdvanceEnabled()) startAutoAdvance(logger);
}
