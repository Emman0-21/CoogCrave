import "server-only";

import { z } from "zod";

/**
 * Runtime configuration, parsed once from environment variables.
 * The app fails fast with a list of *which* variables are wrong — never their values,
 * because values are often secrets (docs/THREAT_MODEL.md T-27).
 */
const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// URL" });

/** The placeholder in .env.example. Fine on a laptop; refused anywhere deployed. */
export const LOCAL_DEV_AUTH_SECRET = "local-dev-only-auth-secret-not-for-deployment-000";

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const domainList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.string().regex(DOMAIN, "must be a comma-separated list of domains, e.g. uh.edu"))
      .min(1, "must list at least one domain"),
  );

const envSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "preview", "production"]),
    APP_URL: z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }),
    DATABASE_URL: postgresUrl,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    // Sign-up is limited to these email domains; subdomains match (uh.edu covers cougarnet.uh.edu).
    ALLOWED_EMAIL_DOMAINS: domainList.default(["uh.edu"]),
    // Only "file" exists so far: emails are written to MAIL_OUTBOX_DIR for local use and tests.
    MAIL_TRANSPORT: z.enum(["file"]).default("file"),
    MAIL_FROM: z.string().min(3).default("CoogCrave <no-reply@coogcrave.test>"),
    MAIL_OUTBOX_DIR: z.string().min(1).default(".data/mail"),
  })
  .superRefine((env, ctx) => {
    const deployed = env.APP_ENV === "production" || env.APP_ENV === "preview";
    if (!deployed) return;
    if (!env.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in deployed environments" });
    }
    if (env.BETTER_AUTH_SECRET === LOCAL_DEV_AUTH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "is the local placeholder; generate a real secret for deployed environments",
      });
    }
    if (env.MAIL_TRANSPORT === "file") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_TRANSPORT"],
        message:
          "is 'file', which can't deliver email; deployed environments need a real mail provider (planned for Phase 8)",
      });
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
      // "is required" only for a genuinely missing value. Deployed-environment rules ("custom" issues) can
      // fail on fields that were left unset and defaulted, and keep their own message.
      const missing = issue.code !== "custom" && env[name] === undefined;
      const message = missing ? "is required" : issue.message;
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
