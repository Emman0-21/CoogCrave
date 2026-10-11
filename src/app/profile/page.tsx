import type { Metadata } from "next";

import { ProfileForm } from "@/components/features/profile/profile-form";
import { requirePageAccess } from "@/server/auth/page-guards";
import { listDropPoints } from "@/server/services/locations";
import { getMe } from "@/server/services/profile";

export const metadata: Metadata = { title: "Your account" };

const COURIER_STATUS_TEXT: Record<string, string> = {
  PENDING: "Courier application under review",
  APPROVED: "Approved courier",
  REJECTED: "Courier application not approved",
  SUSPENDED: "Courier access paused",
};

export default async function ProfilePage() {
  const actor = await requirePageAccess("user", "/profile");
  const [me, locations] = await Promise.all([getMe(actor), listDropPoints()]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-12">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">Your account</h1>

      <div className="mt-10 grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] md:gap-16">
        <section aria-labelledby="account-heading">
          <h2 id="account-heading" className="font-display text-2xl font-extrabold">
            Signed in as
          </h2>
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
            <dt className="text-ink-muted">Name</dt>
            <dd>{me.name}</dd>
            <dt className="text-ink-muted">Email</dt>
            <dd>
              <span className="break-all">{me.email}</span>{" "}
              {me.emailVerified && (
                <span className="text-sm whitespace-nowrap text-success-700">(confirmed)</span>
              )}
            </dd>
            <dt className="text-ink-muted">Account</dt>
            <dd>{me.role === "ADMIN" ? "Administrator" : "Student"}</dd>
            {me.courier && (
              <>
                <dt className="text-ink-muted">Delivering</dt>
                <dd>{COURIER_STATUS_TEXT[me.courier.status] ?? me.courier.status}</dd>
              </>
            )}
          </dl>
          <p className="mt-6 max-w-prose text-sm text-ink-muted">
            A confirmed email shows you control a UH inbox. It isn&apos;t a check of current enrollment.
          </p>
        </section>

        <section
          aria-labelledby="delivery-heading"
          className="rounded-ticket bg-surface px-5 pt-9 pb-10 ticket-edges sm:px-7"
        >
          <h2 id="delivery-heading" className="font-display text-2xl font-extrabold">
            Delivery details
          </h2>
          <p className="mt-2 mb-6 text-ink-muted">Couriers see these when they bring your order.</p>
          <ProfileForm
            displayName={me.profile.displayName}
            defaultLocationId={me.profile.defaultLocationId}
            locations={locations}
          />
        </section>
      </div>
    </main>
  );
}
