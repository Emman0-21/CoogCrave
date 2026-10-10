import "server-only";

import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

/**
 * Keys whose values must never reach logs (docs/THREAT_MODEL.md T-27, PRD NFR-6).
 * Matched at the top level and up to three levels deep, since pino's `*` wildcard spans one level.
 */
const SENSITIVE_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "cookie",
  "authorization",
  "deliveryInstructions",
  "email",
] as const;

function redactPaths(): string[] {
  return SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`]);
}

export const REDACTED = "[redacted]";

export function createLogger(options: { level?: string } = {}, destination?: DestinationStream): Logger {
  const config: LoggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? "info",
    base: { service: "coogcrave", env: process.env.APP_ENV ?? "unknown" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: redactPaths(), censor: REDACTED },
    formatters: { level: (label) => ({ level: label }) },
  };
  return destination ? pino(config, destination) : pino(config);
}

export const logger: Logger = createLogger();
