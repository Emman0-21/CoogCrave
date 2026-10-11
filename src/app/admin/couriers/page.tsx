import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage } from "@/components/features/admin/admin-page";
import { COURIER_STATUS_LABEL } from "@/components/features/admin/labels";
import { ReasonAction } from "@/components/features/admin/reason-action";
import { TRANSPORT_LABEL } from "@/components/features/courier/transport";
import { requirePageAccess } from "@/server/auth/page-guards";
import { courierDecisionsFor } from "@/server/domain/admin-rules";
import { listCouriers } from "@/server/services/admin-people";
import { COURIER_STATUSES, type CourierStatus } from "@/shared/enums";
import { formatDateTime, CAMPUS_TIME_ZONE } from "@/shared/format";
import type { AdminCourierView, CourierDecision } from "@/shared/schemas/admin";

export const metadata: Metadata = { title: "Couriers" };

const TABS: { value: CourierStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Waiting for review" },
  { value: "APPROVED", label: "Approved" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REJECTED", label: "Not approved" },
  { value: "ALL", label: "All" },
];

const DECISION: Record<
  CourierDecision,
  { label: string; submit: string; note: string; required: boolean; done: string; primary?: boolean }
> = {
  APPROVE: {
    label: "Approve",
    submit: "Approve courier",
    note: "Note to the courier",
    required: false,
    done: "Approved.",
    primary: true,
  },
  REJECT: {
    label: "Don't approve",
    submit: "Don't approve",
    note: "What they'd need to change",
    required: true,
    done: "Not approved.",
  },
  SUSPEND: {
    label: "Suspend",
    submit: "Suspend courier",
    note: "Reason",
    required: true,
    done: "Suspended.",
  },
  REINSTATE: {
    label: "Reinstate",
    submit: "Reinstate courier",
    note: "Note",
    required: false,
    done: "Reinstated.",
  },
};

function statusFrom(raw: string | string[] | undefined): CourierStatus | "ALL" {
  const value = typeof raw === "string" ? raw : "PENDING";
  return value === "ALL" || (COURIER_STATUSES as readonly string[]).includes(value)
    ? (value as CourierStatus | "ALL")
    : "PENDING";
}

function CourierRow({ courier }: { courier: AdminCourierView }) {
  const decisions = courierDecisionsFor(courier.status);
  return (
    <li className="grid gap-x-8 gap-y-3 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        <p className="text-lg font-bold">{courier.name}</p>
        <p className="break-all text-ink-muted">{courier.email}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">Status</dt>
          <dd>
            {COURIER_STATUS_LABEL[courier.status]}
            {courier.isOnline && ", online now"}
          </dd>
          <dt className="text-ink-muted">Gets around</dt>
          <dd>{TRANSPORT_LABEL[courier.transportMode]}</dd>
          <dt className="text-ink-muted">Applied</dt>
          <dd>{formatDateTime(courier.appliedAt, CAMPUS_TIME_ZONE)}</dd>
          <dt className="text-ink-muted">Deliveries</dt>
          <dd>
            {courier.completedDeliveries} completed{courier.hasActiveDelivery && ", one in progress"}
          </dd>
          {courier.reviewedAt && (
            <>
              <dt className="text-ink-muted">Last decision</dt>
              <dd>
                {formatDateTime(courier.reviewedAt, CAMPUS_TIME_ZONE)}
                {courier.reviewedBy && ` by ${courier.reviewedBy}`}
                {courier.reviewNote && `: “${courier.reviewNote}”`}
              </dd>
            </>
          )}
        </dl>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {decisions.length === 0 && (
          <p className="text-sm text-ink-muted">They can apply again from the Deliver page.</p>
        )}
        {decisions.map((decision) => {
          const d = DECISION[decision];
          return (
            <ReasonAction
              key={decision}
              label={d.label}
              accessibleLabel={`${d.label}: ${courier.name}`}
              variant={d.primary ? "primary" : "secondary"}
              submitLabel={d.submit}
              reasonLabel={d.note}
              reasonHint={
                decision === "SUSPEND" && courier.hasActiveDelivery
                  ? "They have a delivery in progress. Unassign it or close it from the order page first."
                  : "The courier sees this note."
              }
              reasonRequired={d.required}
              maxLength={500}
              url={`/api/v1/admin/couriers/${courier.id}/decision`}
              body={{ decision }}
              reasonField="note"
              doneText={d.done}
            />
          );
        })}
      </div>
    </li>
  );
}

/** Courier applications and couriers (PRD ADM-2). Opens on the review queue. */
export default async function CouriersPage(props: PageProps<"/admin/couriers">) {
  await requirePageAccess("admin", "/admin/couriers");
  const status = statusFrom((await props.searchParams).status);
  const couriers = await listCouriers(status === "ALL" ? undefined : status);

  return (
    <AdminPage
      title="Couriers"
      intro="Approve students who applied to deliver, and manage approved couriers."
    >
      <nav aria-label="Courier status" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <li key={tab.value}>
              <Link
                href={`/admin/couriers?status=${tab.value}`}
                aria-current={tab.value === status ? "page" : undefined}
                className={
                  tab.value === status
                    ? "inline-flex min-h-11 items-center rounded-control bg-ink px-4 font-bold text-canvas"
                    : "inline-flex min-h-11 items-center rounded-control border border-line-strong px-4 hover:bg-surface"
                }
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {couriers.length === 0 ? (
        <p className="mt-8 text-ink-muted">
          {status === "PENDING" ? "No applications waiting. New ones appear here." : "No couriers here."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line" aria-label="Couriers">
          {couriers.map((courier) => (
            <CourierRow key={courier.id} courier={courier} />
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
