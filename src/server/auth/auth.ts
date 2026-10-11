import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { Logger } from "pino";

import { type AppConfig, getConfig } from "@/server/config";
import { type Database, getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { isAllowedEmailDomain } from "@/server/domain/email";
import { logger as rootLogger, scrubPersonalData } from "@/server/logger";
import { FileOutboxMailer, type Mailer } from "@/server/mail/mailer";
import {
  existingAccountEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
} from "@/server/mail/templates";

import { checkPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-policy";

/**
 * Better Auth endpoints the app doesn't use. Disabling them shrinks the attack surface: profile
 * changes go through PATCH /api/v1/me (our validation), and there are no social logins.
 */
export const DISABLED_AUTH_PATHS = [
  "/update-user",
  "/delete-user",
  "/change-email",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/link-social",
  "/list-accounts",
  "/unlink-account",
  "/refresh-token",
  "/get-access-token",
  "/account-info",
  "/sign-in/social",
  "/callback/:id",
  "/verify-password",
  "/update-session",
  "/delete-user/callback",
] as const;

const SEVEN_DAYS = 60 * 60 * 24 * 7;
const ONE_DAY = 60 * 60 * 24;

export interface AuthDeps {
  db: Database;
  config: AppConfig;
  mailer: Mailer;
  logger: Logger;
}

function authError(status: "BAD_REQUEST" | "FORBIDDEN", code: string, message: string): APIError {
  return new APIError(status, { code, message });
}

export function createAuth({ db, config, mailer, logger }: AuthDeps) {
  const log = logger.child({ source: "auth" });
  const appUrl = config.APP_URL.replace(/\/$/, "");

  return betterAuth({
    appName: "CoogCrave",
    baseURL: appUrl,
    basePath: "/api/auth",
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.appOrigin],
    telemetry: { enabled: false },

    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true, transaction: true }),

    // Better Auth logs messages such as "Sign-up attempt for existing email: <address>".
    // Everything goes through our logger with addresses scrubbed, and only Error arguments are kept.
    logger: {
      level: "info",
      log: (level, message, ...args) => {
        const err = args.find((arg) => arg instanceof Error);
        const method =
          level === "error" ? "error" : level === "warn" ? "warn" : level === "debug" ? "debug" : "info";
        log[method](err ? { err } : {}, scrubPersonalData(message));
      },
    },

    // Rate limiting is done by our own Postgres-backed limiter in the route wrapper, which also
    // covers per-email limits and is shared across server instances (src/server/auth/route-handler.ts).
    rateLimit: { enabled: false },

    advanced: {
      // Better Auth turns these checks OFF by default when NODE_ENV=test (or TEST is set). Pinning them on
      // means tests exercise exactly the production behavior: callback/redirect URLs must be same-origin
      // (open-redirect protection) and cookie-bearing requests must come from a trusted origin.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: "coogcrave",
      // Secure cookies whenever the app is served over HTTPS (always, when deployed).
      useSecureCookies: appUrl.startsWith("https://"),
      database: { generateId: "uuid" },
    },

    user: {
      additionalFields: {
        // input: false means sign-up and profile requests can never set these (THREAT_MODEL T-02).
        role: { type: "string", input: false, required: false, defaultValue: "STUDENT" },
        suspendedAt: { type: "date", input: false, required: false },
      },
    },

    session: {
      // A fixed 7-day lifetime from sign-in. Sessions are read server-side, where the cookie can't be
      // re-issued, so a "sliding" refresh would extend the database row but not the browser cookie.
      expiresIn: SEVEN_DAYS,
      disableSessionRefresh: true,
      // Every request checks the session row, so suspension and sign-out take effect immediately.
      cookieCache: { enabled: false },
    },

    // Password-reset tokens are stored as hashes, so a database read can't be turned into a reset link.
    verification: { storeIdentifier: "hashed" },

    disabledPaths: [...DISABLED_AUTH_PATHS],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send(passwordResetEmail(user.email, user.name, url));
        log.info({ userId: user.id }, "password reset email sent");
      },
      onPasswordReset: async ({ user }) => {
        await mailer.send(passwordChangedEmail(user.email, user.name, `${appUrl}/forgot-password`));
        log.info({ userId: user.id }, "password reset completed");
      },
      // Sign-up answers identically for new and existing emails; the real owner gets told by email.
      onExistingUserSignUp: async ({ user }) => {
        await mailer.send(
          existingAccountEmail(user.email, user.name, `${appUrl}/sign-in`, `${appUrl}/forgot-password`),
        );
        log.info({ userId: user.id }, "existing-account notice sent");
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      // Signing in to an unverified account re-sends the link (only after the correct password).
      sendOnSignIn: true,
      // After verifying, the user signs in deliberately. A link opened by an email scanner
      // shouldn't hand that scanner a session.
      autoSignInAfterVerification: false,
      expiresIn: ONE_DAY,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send(verificationEmail(user.email, user.name, url));
        log.info({ userId: user.id }, "verification email sent");
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;

        if (ctx.path === "/sign-up/email") {
          const email = typeof body.email === "string" ? body.email : "";
          const name = typeof body.name === "string" ? body.name.trim() : "";
          if (!isAllowedEmailDomain(email, config.ALLOWED_EMAIL_DOMAINS)) {
            throw authError(
              "BAD_REQUEST",
              "EMAIL_DOMAIN_NOT_ALLOWED",
              `Sign up with your University of Houston email (${config.ALLOWED_EMAIL_DOMAINS.join(" or ")}).`,
            );
          }
          if (name.length < 1 || name.length > 100 || /[\u0000-\u001f\u007f<>]/.test(name)) {
            throw authError("BAD_REQUEST", "INVALID_NAME", "Enter your name (up to 100 characters).");
          }
          const verdict = checkPassword(typeof body.password === "string" ? body.password : "", [
            name,
            email,
          ]);
          if (!verdict.ok) throw authError("BAD_REQUEST", "PASSWORD_TOO_WEAK", verdict.message);
        }

        if (ctx.path === "/reset-password" || ctx.path === "/change-password") {
          const verdict = checkPassword(typeof body.newPassword === "string" ? body.newPassword : "");
          if (!verdict.ok) throw authError("BAD_REQUEST", "PASSWORD_TOO_WEAK", verdict.message);
        }
      }),
    },

    databaseHooks: {
      session: {
        create: {
          // A suspended account can't start a session (PRD AUTH-7). Runs only after the password
          // was verified, so it reveals nothing to someone guessing passwords.
          before: async (session) => {
            const [user] = await db
              .select({ suspendedAt: schema.users.suspendedAt })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId));
            if (user?.suspendedAt) {
              throw authError("FORBIDDEN", "ACCOUNT_SUSPENDED", "This account is suspended.");
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __coogcraveAuth?: Auth };

/** The app's auth instance, created on first use (so `next build` needs no secrets). */
export function getAuth(): Auth {
  if (!globalForAuth.__coogcraveAuth) {
    const config = getConfig();
    globalForAuth.__coogcraveAuth = createAuth({
      db: getDb(),
      config,
      mailer: new FileOutboxMailer(config.MAIL_OUTBOX_DIR, config.MAIL_FROM),
      logger: rootLogger,
    });
  }
  return globalForAuth.__coogcraveAuth;
}
