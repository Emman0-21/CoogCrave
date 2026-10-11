import type { Metadata } from "next";
import Link from "next/link";

import { STATUS_LABEL } from "@/components/features/orders/status-text";
import { buttonClasses } from "@/components/ui/button";
import { requirePageAccess } from "@/server/auth/page-guards";
import type { Actor } from "@/server/domain/actor";
import { AppError } from "@/server/http/errors";
import { listOrders } from "@/server/services/orders";
import { CAMPUS_TIME_ZONE, formatCents, formatDateTime } from "@/shared/format";
import type { OrderSummaryView } from "@/shared/schemas/ordering";

export const metadata: Metadata = { title: "Your orders" };

function OrderRows({ orders, labelledBy }: { orders: OrderSummaryView[]; labelledBy: string }) {
  return (
    <ul aria-labelledby={labelledBy} className="mt-3 divide-y divide-line border-y border-line">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={`/orders/${o.id}`}
            className="group grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
          >
            <span className="font-bold group-hover:underline group-hover:underline-offset-4">
              {o.restaurantName}, {o.orderNumber}
            </span>
            <span className="sm:justify-self-end">{STATUS_LABEL[o.status]}</span>
            <span className="text-sm text-ink-muted sm:col-span-2">
              {formatDateTime(o.createdAt, CAMPUS_TIME_ZONE)}. {o.itemCount}{" "}
              {o.itemCount === 1 ? "item" : "items"}, {formatCents(o.totalCents)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Past orders; a cursor that doesn't parse (an edited URL) shows the first page instead of an error. */
async function pastOrders(actor: Actor, cursor: string | undefined) {
  try {
    return await listOrders(actor, { scope: "past", limit: 20, cursor });
  } catch (error) {
    if (cursor && error instanceof AppError && error.code === "VALIDATION_ERROR") {
      return listOrders(actor, { scope: "past", limit: 20 });
    }
    throw error;
  }
}

/** Order history: in-progress orders first, then past ones a page at a time (PRD ORD-8). */
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const actor = await requirePageAccess("user", "/orders");
  const { before } = await searchParams;
  const cursor = typeof before === "string" && before.length <= 200 ? before : undefined;
  const [active, past] = await Promise.all([
    listOrders(actor, { scope: "active", limit: 50 }),
    pastOrders(actor, cursor),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">Your orders</h1>

      {active.data.length === 0 && past.data.length === 0 && !cursor ? (
        <div className="mt-8 space-y-5">
          <p className="text-lg text-ink-muted">No orders yet. Your first one is a few taps away.</p>
          <Link href="/restaurants" className={buttonClasses("primary")}>
            Browse restaurants
          </Link>
        </div>
      ) : (
        <>
          {!cursor && (
            <section className="mt-8">
              <h2 id="active-heading" className="font-display text-2xl font-extrabold">
                In progress
              </h2>
              {active.data.length ? (
                <OrderRows orders={active.data} labelledBy="active-heading" />
              ) : (
                <p className="mt-2 text-ink-muted">Nothing on the way right now.</p>
              )}
            </section>
          )}
          <section className="mt-12">
            <h2 id="past-heading" className="font-display text-2xl font-extrabold">
              Past orders
            </h2>
            {past.data.length ? (
              <OrderRows orders={past.data} labelledBy="past-heading" />
            ) : (
              <p className="mt-2 text-ink-muted">Finished and cancelled orders show up here.</p>
            )}
            {past.nextCursor && (
              <Link
                href={`/orders?before=${encodeURIComponent(past.nextCursor)}`}
                className={buttonClasses("secondary", "mt-6")}
              >
                Older orders
              </Link>
            )}
          </section>
        </>
      )}
    </main>
  );
}
