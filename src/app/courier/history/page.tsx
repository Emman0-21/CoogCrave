import type { Metadata } from "next";
import Link from "next/link";

import { requirePageAccess } from "@/server/auth/page-guards";
import { getEarnings, listDeliveries } from "@/server/services/courier";
import { CAMPUS_TIME_ZONE, formatCents, formatDateTime } from "@/shared/format";

export const metadata: Metadata = { title: "Your deliveries" };

const OUTCOME: Record<string, string> = {
  DELIVERED: "Delivered",
  RELEASED_BY_COURIER: "Given back",
  UNASSIGNED_BY_ADMIN: "Reassigned by an admin",
  ORDER_CANCELLED: "Order cancelled",
  DELIVERY_FAILED: "Couldn't deliver",
};

/** Delivery history and SIMULATED earnings (PRD DLV-10, DLV-11). Approved couriers only; others get 404. */
export default async function CourierHistoryPage() {
  const actor = await requirePageAccess("courier", "/courier/history");
  const [deliveries, earnings] = await Promise.all([listDeliveries(actor, 50), getEarnings(actor)]);
  const stats: [string, string][] = [
    ["Today", formatCents(earnings.todayCents)],
    ["This week", formatCents(earnings.weekCents)],
    ["All time", formatCents(earnings.allTimeCents)],
    ["Deliveries", String(earnings.completedDeliveries)],
    ["Rating", earnings.averageRating === null ? "No ratings yet" : `${earnings.averageRating} of 5`],
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <p className="text-ink-muted">
        <Link href="/courier" className="underline underline-offset-4">
          Deliver
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">
        Your deliveries
      </h1>

      <section
        aria-labelledby="earnings-heading"
        className="mt-8 rounded-ticket bg-surface px-5 pt-8 pb-8 ticket-edges sm:px-7"
      >
        <h2 id="earnings-heading" className="font-display text-2xl font-extrabold">
          Simulated earnings
        </h2>
        <p className="mt-1 text-ink-muted">
          No payouts. These show what the delivery fee plus tips would add up to.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="text-xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="history-heading" className="mt-12">
        <h2 id="history-heading" className="font-display text-2xl font-extrabold">
          History
        </h2>
        {deliveries.length === 0 ? (
          <p className="mt-3 text-ink-muted">No deliveries yet.</p>
        ) : (
          <ul aria-labelledby="history-heading" className="mt-3 divide-y divide-line border-y border-line">
            {deliveries.map((d) => (
              <li
                key={`${d.orderId}-${d.assignedAt}`}
                className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <span className="font-bold">
                  {d.restaurantName} to {d.dropLocation}
                </span>
                <span className="sm:justify-self-end">
                  {d.payoutCents === null ? "No payout" : formatCents(d.payoutCents)}
                </span>
                <span className="text-sm text-ink-muted sm:col-span-2">
                  {d.orderNumber}. {formatDateTime(d.assignedAt, CAMPUS_TIME_ZONE)}.{" "}
                  {d.endReason ? OUTCOME[d.endReason] : "In progress"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
