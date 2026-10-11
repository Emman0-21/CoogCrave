import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps, tz } from "./columns";
import { userRole } from "./enums";

/**
 * Tables owned by Better Auth (docs/ARCHITECTURE.md §8). Property names must match Better Auth's
 * field names (it maps fields through these keys); column names are snake_case.
 * The library validates this schema at startup and refuses requests if it doesn't match.
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // App fields. Declared `input: false` in the auth config, so no client request can set them.
    role: userRole("role").notNull().default("STUDENT"),
    suspendedAt: tz("suspended_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    // Better Auth lowercases emails; the database refuses anything that would bypass the unique index by case.
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: tz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.token), index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    // Password hash for email/password sign-in (providerId = "credential"). Never selected by app code.
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tz("access_token_expires_at"),
    refreshTokenExpiresAt: tz("refresh_token_expires_at"),
    scope: text("scope"),
    ...timestamps,
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_unique").on(t.providerId, t.accountId),
  ],
);

/** Password-reset tokens (stored hashed) and other one-time values. */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tz("expires_at").notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
