import "server-only";

import { z } from "zod";

/**
 * Runtime configuration, parsed once from environment variables.
 * The app fails fast with a list of *which* variables are wrong — never their values,
 * because values are often secrets (docs/THREAT_MODEL.md T-27).
 */
const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// URL" });

const envSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "preview", "production"]),
    APP_URL: z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }),
    DATABASE_URL: postgresUrl,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((env, ctx) => {
    const deployed = env.APP_ENV === "production" || env.APP_ENV === "preview";
    if (deployed && !env.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in deployed environments" });
    }
  });

export type AppConfig = Readonly<z.infer<typeof envSchema> & { appOrigin: string }>;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/** Pure: validate an env-like object. Exported for tests. */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "(root)";
      const message = env[name] === undefined ? "is required" : issue.message;
      return `${name} ${message}`;
    });
    throw new ConfigError(problems);
  }
  return Object.freeze({ ...result.data, appOrigin: new URL(result.data.APP_URL).origin });
}

let cached: AppConfig | undefined;

/** Lazily parsed so `next build` can load route modules without runtime secrets present. */
export function getConfig(): AppConfig {
  cached ??= parseConfig(process.env);
  return cached;
}
