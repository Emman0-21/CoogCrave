import "server-only";

import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/server/db/client";
import { accounts, users } from "@/server/db/schema";
import { checkPassword } from "@/server/auth/password-policy";
import { normalizeEmail } from "@/server/domain/email";
import { recordAudit } from "@/server/services/audit";
import type { UserRole } from "@/shared/enums";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface CredentialUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

/**
 * Creates (or updates) a verified email/password account directly, bypassing sign-up. Used only by
 * trusted scripts (demo seed, admin CLI) — never reachable from HTTP. Passwords are hashed with Better
 * Auth's own hasher, so these accounts sign in through the normal flow.
 */
export async function upsertCredentialUser(
  tx: Tx,
  input: CredentialUserInput,
): Promise<{ userId: string; created: boolean }> {
  const email = normalizeEmail(input.email);
  const [row] = await tx
    .insert(users)
    .values({ email, name: input.name, role: input.role, emailVerified: true })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: input.name,
        role: input.role,
        emailVerified: true,
        suspendedAt: null,
        updatedAt: new Date(),
      },
    })
    // xmax = 0 only for a freshly inserted row: tells "created" from "updated" in one round trip.
    .returning({ userId: users.id, created: sql<boolean>`(xmax = 0)` });
  if (!row) throw new Error("account upsert returned no row");

  const passwordHash = await hashPassword(input.password);
  await tx
    .insert(accounts)
    .values({ userId: row.userId, providerId: "credential", accountId: row.userId, password: passwordHash })
    .onConflictDoUpdate({
      target: [accounts.providerId, accounts.accountId],
      set: { password: passwordHash, updatedAt: new Date() },
    });
  return row;
}

export const adminInputSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  name: z.string().trim().min(1, "Enter a name.").max(100, "Use at most 100 characters."),
  password: z.string(),
});

export type AdminResult = { userId: string; outcome: "created" | "promoted" };

/**
 * `pnpm admin:create`: the only way to make an administrator (docs/ARCHITECTURE.md §8). A new email gets
 * a new verified admin account; an existing account is promoted and keeps its current password.
 * Either way a SYSTEM audit event is recorded in the same transaction.
 */
export async function createOrPromoteAdmin(
  db: Database,
  input: z.input<typeof adminInputSchema>,
  via = "cli:admin:create",
): Promise<AdminResult> {
  const { email, name, password } = adminInputSchema.parse(input);
  const normalized = normalizeEmail(email);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, normalized));
    if (existing) {
      await tx.update(users).set({ role: "ADMIN", updatedAt: new Date() }).where(eq(users.id, existing.id));
      await recordAudit(tx, {
        by: { kind: "SYSTEM", label: via },
        action: "user.promote_admin",
        targetType: "user",
        targetId: existing.id,
      });
      return { userId: existing.id, outcome: "promoted" as const };
    }

    const verdict = checkPassword(password, [name, normalized]);
    if (!verdict.ok) throw new Error(`Password rejected: ${verdict.message}`);
    const { userId } = await upsertCredentialUser(tx, { email: normalized, name, password, role: "ADMIN" });
    await recordAudit(tx, {
      by: { kind: "SYSTEM", label: via },
      action: "user.create_admin",
      targetType: "user",
      targetId: userId,
    });
    return { userId, outcome: "created" as const };
  });
}
