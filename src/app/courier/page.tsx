import type { Metadata } from "next";
import Link from "next/link";

import { CourierApplyForm } from "@/components/features/courier/apply-form";
import { CourierDashboard } from "@/components/features/courier/courier-dashboard";
import { TRANSPORT_LABEL } from "@/components/features/courier/transport";
import { Notice } from "@/components/ui/notice";
import { requirePageAccess } from "@/server/auth/page-guards";
import { AppError } from "@/server/http/errors";
import { getActiveDelivery, getCourierProfile, listOffers } from "@/server/services/courier";
import { CAMPUS_TIME_ZONE } from "@/shared/format";
import type { CourierProfileView } from "@/shared/schemas/delivery";

export const metadata: Metadata = { title: "Deliver" };

async function profileOf(actor: Parameters<typeof getCourierProfile>[0]): Promise<CourierProfileView | null> {
  try {
    return await getCourierProfile(actor);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

/**
 * Courier home (PRD DLV-1…10). Any signed-in student can open it: without a profile it's the
 * application; pending and paused profiles explain where they stand; approved couriers get the dashboard.
 */
export default async function CourierPage() {
  const actor = await requirePageAccess("user", "/courier");
  const profile = await profileOf(actor);
  const approved = profile?.status === "APPROVED";
  const [active, offers] = approved
    ? await Promise.all([
        getActiveDelivery(actor),
        profile.isOnline ? listOffers(actor) : Promise.resolve([]),
      ])
    : [null, []];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">Deliver</h1>

      {!profile || profile.status === "REJECTED" ? (
        <>
          <p className="mt-4 max-w-prose text-lg text-ink-muted">
            Carry campus food between classes. Take one order at a time, walk or ride it across campus, and
            see what you&apos;d earn on each run (simulated in this demo).
          </p>
          {profile?.status === "REJECTED" && (
            <Notice tone="info" className="mt-6">
              Your last application wasn&apos;t approved{profile.reviewNote ? `: ${profile.reviewNote}` : "."}{" "}
              You can apply again.
            </Notice>
          )}
          <div className="mt-8">
            <CourierApplyForm />
          </div>
        </>
      ) : profile.status === "PENDING" ? (
        <Notice tone="info" className="mt-8">
          <p>
            <strong>Application received.</strong> A CoogCrave admin reviews new couriers. You applied to
            deliver {TRANSPORT_LABEL[profile.transportMode].toLowerCase()}.
          </p>
          <p>Admin approvals arrive in a later release; for the demo, use the seeded courier account.</p>
        </Notice>
      ) : profile.status === "SUSPENDED" ? (
        <Notice tone="error" className="mt-8">
          Your courier access is paused. Contact a CoogCrave admin if you think this is a mistake.
        </Notice>
      ) : (
        <>
          <p className="mt-3 text-ink-muted">
            <Link href="/courier/history" className="underline underline-offset-4">
              Your deliveries and simulated earnings
            </Link>
          </p>
          <div className="mt-8">
            <CourierDashboard
              isOnline={profile.isOnline}
              active={active}
              offers={offers}
              timeZone={CAMPUS_TIME_ZONE}
            />
          </div>
        </>
      )}
      {!approved && (
        <p className="mt-10 text-sm text-ink-muted">
          You can&apos;t deliver your own orders, and couriers only ever see a customer&apos;s first name and
          building.
        </p>
      )}
    </main>
  );
}
