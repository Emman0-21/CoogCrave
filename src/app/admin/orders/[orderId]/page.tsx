import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPage } from "@/components/features/admin/admin-page";
import {
  ACTOR_LABEL,
  END_REASON_LABEL,
  ORDER_STATUS_LABEL,
  resolutionLabel,
} from "@/components/features/admin/labels";
import { ReasonAction } from "@/components/features/admin/reason-action";
import { StatusBadge } from "@/components/features/admin/status-badge";
import { PriceBreakdown } from "@/components/features/cart/price-breakdown";
import { Stars } from "@/components/features/orders/review-panel";
import { requirePageAccess } from "@/server/auth/page-guards";
import { getAdminOrder } from "@/server/services/admin-orders";
import { CAMPUS_TIME_ZONE, formatCents, formatDateTime } from "@/shared/format";

export const metadata: Metadata = { title: "Order record" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * One order's full record (PRD ADM-6, ADM-8): who ordered, every status change with who made it and why,
 * every courier assignment, the simulated payment, and the fixes an admin can make from here.
 */
export default async function AdminOrderPage(props: PageProps<"/admin/orders/[orderId]">) {
  const { orderId } = await props.params;
  await requirePageAccess("admin", `/admin/orders/${orderId}`);
  if (!UUID.test(orderId)) notFound();
  const order = await getAdminOrder(orderId);
  if (!order) notFound();

  return (
    <AdminPage title={`Order ${order.orderNumber}`}>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge status={order.status} />
        <span className="text-ink-muted">
          {order.restaurant.name} to {order.deliveryLocation.name}. Placed{" "}
          {formatDateTime(order.createdAt, CAMPUS_TIME_ZONE)}.
        </span>
      </p>

      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-10">
          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="font-display text-2xl font-extrabold">
              History
            </h2>
            <ol className="mt-3 border-l-2 border-line-strong">
              {order.timeline.map((event, i) => (
                <li key={i} className="relative pb-5 pl-5 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 -left-[7px] size-3 rounded-full border-2 border-canvas bg-ink"
                  />
                  <p className="font-bold">{ORDER_STATUS_LABEL[event.status]}</p>
                  <p className="text-sm text-ink-muted">
                    <time dateTime={event.at}>{formatDateTime(event.at, CAMPUS_TIME_ZONE)}</time>
                    {", by "}
                    {ACTOR_LABEL[event.actorType].toLowerCase()}
                    {event.actor
                      ? ` (${event.actor.name})`
                      : event.actorType === "RESTAURANT_SIM" && " (automatic demo step)"}
                  </p>
                  {event.reason && <p className="mt-1">“{event.reason}”</p>}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="couriers-heading">
            <h2 id="couriers-heading" className="font-display text-2xl font-extrabold">
              Couriers
            </h2>
            {order.assignments.length === 0 ? (
              <p className="mt-3 text-ink-muted">No courier has taken this order.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {order.assignments.map((a) => (
                  <li key={a.assignedAt} className="py-3">
                    <p className="font-bold">
                      {a.courierName}{" "}
                      <span className="font-normal break-all text-ink-muted">{a.courierEmail}</span>
                    </p>
                    <p className="text-sm">
                      Accepted {formatDateTime(a.assignedAt, CAMPUS_TIME_ZONE)}
                      {a.pickedUpAt && `, picked up ${formatDateTime(a.pickedUpAt, CAMPUS_TIME_ZONE)}`}
                      {a.endedAt && a.endReason
                        ? `. ${END_REASON_LABEL[a.endReason]} ${formatDateTime(a.endedAt, CAMPUS_TIME_ZONE)}`
                        : ". Still on it"}
                      {a.payoutCents !== null && `. Simulated payout ${formatCents(a.payoutCents)}`}.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="items-heading">
            <h2 id="items-heading" className="font-display text-2xl font-extrabold">
              Items
            </h2>
            <ul className="mt-3 space-y-2">
              {order.items.map((item, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>
                    {item.quantity}× {item.name}
                    {item.options.length > 0 && (
                      <span className="text-ink-muted"> ({item.options.join(", ")})</span>
                    )}
                    {item.specialInstructions && (
                      <span className="block text-sm text-ink-muted">Note: {item.specialInstructions}</span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatCents(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 max-w-sm">
              <PriceBreakdown price={order.price} />
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="fix-heading" className="rounded-ticket bg-surface p-5">
            <h2 id="fix-heading" className="font-display text-xl font-extrabold">
              Fix a problem
            </h2>
            {order.allowedTransitions.length === 0 ? (
              <p className="mt-2 text-ink-muted">This order is finished. Nothing to change.</p>
            ) : (
              <div className="mt-3 flex flex-col items-start gap-3">
                {order.allowedTransitions.map((t) => (
                  <ReasonAction
                    key={t.toStatus}
                    label={resolutionLabel(order.status, t.toStatus)}
                    submitLabel={resolutionLabel(order.status, t.toStatus)}
                    reasonLabel="Reason"
                    reasonHint="The customer and any courier are notified. Recorded in the activity log."
                    reasonRequired={t.reasonRequired}
                    maxLength={300}
                    url={`/api/v1/orders/${order.id}/transitions`}
                    body={{ toStatus: t.toStatus, expectedVersion: order.version }}
                    reasonField="reason"
                    doneText="Done."
                  />
                ))}
              </div>
            )}
            {(order.status === "PLACED" || order.status === "CONFIRMED") && (
              <Link href="/admin/kitchen" className="mt-3 inline-block underline underline-offset-4">
                Open the Kitchen Console
              </Link>
            )}
          </section>

          <section aria-labelledby="customer-heading">
            <h2 id="customer-heading" className="font-display text-xl font-extrabold">
              Customer
            </h2>
            <p className="mt-2 font-bold">{order.customer.name}</p>
            <p className="break-all text-ink-muted">{order.customer.email}</p>
            <p className="mt-2">Deliver to {order.deliveryLocation.name}</p>
            {order.deliveryInstructions && <p className="mt-1">Note: “{order.deliveryInstructions}”</p>}
          </section>

          <section aria-labelledby="payment-heading">
            <h2 id="payment-heading" className="font-display text-xl font-extrabold">
              Payment (simulated)
            </h2>
            {order.payment ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-ink-muted">Status</dt>
                <dd>
                  {{ AUTHORIZED: "Held", CAPTURED: "Collected", VOIDED: "Released" }[order.payment.status]}
                </dd>
                <dt className="text-ink-muted">Amount</dt>
                <dd className="tabular-nums">{formatCents(order.payment.amountCents)}</dd>
                <dt className="text-ink-muted">Reference</dt>
                <dd className="break-all">{order.payment.reference}</dd>
              </dl>
            ) : (
              <p className="mt-2 text-ink-muted">No payment record.</p>
            )}
            <p className="mt-2 text-sm text-ink-muted">Demo payments only. No money moves.</p>
          </section>

          {order.status === "DELIVERED" && (
            <section aria-labelledby="review-heading">
              <h2 id="review-heading" className="font-display text-xl font-extrabold">
                Customer&apos;s rating
              </h2>
              {order.review ? (
                <>
                  <p className="mt-2">
                    <Stars rating={order.review.rating} /> {order.review.rating} out of 5,{" "}
                    {formatDateTime(order.review.createdAt, CAMPUS_TIME_ZONE)}
                  </p>
                  {order.review.comment && <p className="mt-1">“{order.review.comment}”</p>}
                </>
              ) : (
                <p className="mt-2 text-ink-muted">Not rated yet.</p>
              )}
            </section>
          )}
        </aside>
      </div>
    </AdminPage>
  );
}
