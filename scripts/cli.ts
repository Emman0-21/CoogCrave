import { config as loadEnv } from "dotenv";

// Scripts read the same .env as the app. Real environment variables take precedence.
loadEnv({ path: [".env.local", ".env"], quiet: true });

/** Runs a CLI task, printing a clean error (no stack for expected failures) and setting the exit code. */
export async function runCli(task: () => Promise<void>, cleanup: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nError: ${message}`);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}
