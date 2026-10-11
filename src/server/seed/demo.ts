import "server-only";

import { courierProfiles, userProfiles } from "@/server/db/schema";
import type { Database, DbExecutor } from "@/server/db/client";
import { upsertCredentialUser } from "@/server/accounts/accounts";
import { recordAudit } from "@/server/services/audit";
import type { CourierStatus, TransportMode, UserRole } from "@/shared/enums";

import { seedId } from "./ids";

/**
 * Demo accounts for the hackathon walkthrough (PRD §5 J4, docs/DEMO_GUIDE.md later). They use the
 * reserved .test domain, so no real inbox can ever receive mail for them, and they're created directly
 * (sign-up's UH-domain rule applies to self-registration only).
 */
export const DEMO_ACCOUNTS: {
  key: string;
  email: string;
  name: string;
  role: UserRole;
  courier?: { status: CourierStatus; transportMode: TransportMode };
  defaultLocation?: string;
}[] = [
  {
    key: "customer",
    email: "customer@demo.coogcrave.test",
    name: "Casey Customer",
    role: "STUDENT",
    defaultLocation: "library",
  },
  {
    key: "courier",
    email: "courier@demo.coogcrave.test",
    name: "Riley Courier",
    role: "STUDENT",
    courier: { status: "APPROVED", transportMode: "WALK" },
  },
  {
    key: "applicant",
    email: "applicant@demo.coogcrave.test",
    name: "Jamie Applicant",
    role: "STUDENT",
    courier: { status: "PENDING", transportMode: "BIKE" },
  },
  { key: "admin", email: "admin@demo.coogcrave.test", name: "Ada Admin", role: "ADMIN" },
];

export class DemoSeedRefused extends Error {}

/**
 * Puts a demo account's courier profile and user profile back to their starting state: the seeded
 * courier status, offline, no review, no display name. Used by the seed and by demo reset (which
 * leaves passwords alone).
 */
export async function restoreDemoProfiles(
  tx: DbExecutor,
  account: (typeof DEMO_ACCOUNTS)[number],
  userId: string,
): Promise<void> {
  if (account.courier) {
    const values = {
      userId,
      status: account.courier.status,
      transportMode: account.courier.transportMode,
      guidelinesAcceptedAt: new Date(),
      isOnline: false,
      onlineSince: null,
      reviewedAt: null,
      reviewedByUserId: null,
      reviewNote: null,
    };
    await tx
      .insert(courierProfiles)
      .values({ id: seedId(`courier:${account.key}`), ...values })
      .onConflictDoUpdate({ target: courierProfiles.userId, set: { ...values, updatedAt: new Date() } });
  }

  const profile = {
    displayName: null,
    defaultLocationId: account.defaultLocation ? seedId(`location:${account.defaultLocation}`) : null,
  };
  await tx
    .insert(userProfiles)
    .values({ userId, ...profile })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { ...profile, updatedAt: new Date() } });
}

/**
 * Idempotent: re-running resets the demo accounts to their starting state (including the password).
 * Refuses to run in production.
 */
export async function seedDemoAccounts(
  db: Database,
  options: { password: string | undefined; appEnv: string },
): Promise<{ accounts: number }> {
  if (options.appEnv === "production") {
    throw new DemoSeedRefused("Demo accounts are never created in production (APP_ENV=production).");
  }
  if (!options.password || options.password.length < 10) {
    throw new DemoSeedRefused(
      "Set SEED_DEMO_PASSWORD (at least 10 characters) before seeding demo accounts.",
    );
  }
  const password = options.password;

  await db.transaction(async (tx) => {
    for (const account of DEMO_ACCOUNTS) {
      const { userId, created } = await upsertCredentialUser(tx, {
        email: account.email,
        name: account.name,
        password,
        role: account.role,
      });

      await restoreDemoProfiles(tx, account, userId);

      if (account.role === "ADMIN" && created) {
        await recordAudit(tx, {
          by: { kind: "SYSTEM", label: "seed:demo" },
          action: "user.create_admin",
          targetType: "user",
          targetId: userId,
        });
      }
    }
  });
  return { accounts: DEMO_ACCOUNTS.length };
}
