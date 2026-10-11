import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage } from "@/components/features/admin/admin-page";
import { DemoReset } from "@/components/features/admin/demo-reset";
import { ORDER_STATUS_LABEL } from "@/components/features/admin/labels";
import { requirePageAccess } from "@/server/auth/page-guards";
import { demoResetAvailable, getMetrics } from "@/server/services/admin-ops";
import { formatCents } from "@/shared/format";
import type { OrderStatus } from "@/shared/enums";

export const metadata: Metadata = { title: "Admin" };

const PIPELINE: OrderStatus[] = ["PLACED", "CONFIRMED", "READY_FOR_PICKUP", "ASSIGNED", "PICKED_UP"];
const FINISHED: OrderStatus[] = ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"];

/** Admin home (PRD ADM-1): today's orders by where they are, and what needs someone's attention. */
export default async function AdminHome() {
  await requirePageAccess("admin", "/admin");
  const metrics = await getMetrics();
  const placedToday = Object.values(metrics.ordersToday).reduce((a, b) => a + b, 0);
  const waitingForCourier = metrics.ordersToday.READY_FOR_PICKUP;

  return (
    <AdminPage title="Today" intro="Orders placed today (campus time), by where they are now.">
      <section aria-labelledby="pipeline-heading" className="mt-8">
        <h2 id="pipeline-heading" className="sr-only">
          Orders today
        </h2>
        <ol className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-5">
          {PIPELINE.map((status) => (
            <li key={status} className="border-r border-b border-line p-4">
              <Link
                href={`/admin/orders?status=${status}`}
                className="group block"
                aria-label={`${metrics.ordersToday[status]} ${ORDER_STATUS_LABEL[status].toLowerCase()}`}
              >
                <span className="block font-display text-4xl font-black tabular-nums">
                  {metrics.ordersToday[status]}
                </span>
                <span className="text-ink-muted group-hover:underline">{ORDER_STATUS_LABEL[status]}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-ink-muted">
          {placedToday} placed today. Finished:{" "}
          {FINISHED.map((s, i) => (
            <span key={s}>
              {i > 0 && ", "}
              {metrics.ordersToday[s]} {ORDER_STATUS_LABEL[s].toLowerCase()}
            </span>
          ))}
          .
        </p>
      </section>

      <section aria-labelledby="attention-heading" className="mt-10">
        <h2 id="attention-heading" className="font-display text-2xl font-extrabold">
          Needs attention
        </h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
            <span>
              <strong className="tabular-nums">{metrics.pendingApplications}</strong> courier{" "}
              {metrics.pendingApplications === 1 ? "application" : "applications"} waiting for review
            </span>
            <Link href="/admin/couriers" className="font-bold underline underline-offset-4">
              Review applications
            </Link>
          </li>
          <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
            <span>
              <strong className="tabular-nums">{waitingForCourier}</strong> ready{" "}
              {waitingForCourier === 1 ? "order" : "orders"} waiting for a courier, with{" "}
              <strong className="tabular-nums">{metrics.onlineCouriers}</strong>{" "}
              {metrics.onlineCouriers === 1 ? "courier" : "couriers"} online
            </span>
            <Link href="/admin/kitchen" className="font-bold underline underline-offset-4">
              Open the Kitchen Console
            </Link>
          </li>
          <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
            <span>
              <strong className="tabular-nums">{metrics.activeDeliveries}</strong>{" "}
              {metrics.activeDeliveries === 1 ? "delivery" : "deliveries"} in progress
            </span>
            <Link
              href="/admin/orders?status=ASSIGNED&status=PICKED_UP"
              className="font-bold underline underline-offset-4"
            >
              See deliveries
            </Link>
          </li>
        </ul>
        <p className="mt-4 text-ink-muted">
          Simulated sales today:{" "}
          <strong className="text-ink">{formatCents(metrics.simulatedGmvTodayCents)}</strong> from delivered
          orders. Demo payments only; nobody is charged.
        </p>
      </section>

      {demoResetAvailable() && (
        <section aria-labelledby="demo-heading" className="mt-12 border-t border-line pt-8">
          <h2 id="demo-heading" className="font-display text-2xl font-extrabold">
            Reset the demo
          </h2>
          <p className="mt-2 max-w-prose text-ink-muted">
            Deletes every order, cart, and notification belonging to the demo accounts, puts those accounts
            back to how they started, and restores the sample restaurants. Other accounts and the activity log
            aren&apos;t touched. Only available outside production.
          </p>
          <div className="mt-4">
            <DemoReset />
          </div>
        </section>
      )}
    </AdminPage>
  );
}
