import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage } from "@/components/features/admin/admin-page";
import { ORDER_STATUS_LABEL } from "@/components/features/admin/labels";
import { StatusBadge } from "@/components/features/admin/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { requirePageAccess } from "@/server/auth/page-guards";
import { AppError } from "@/server/http/errors";
import { listAdminOrders } from "@/server/services/admin-orders";
import { ORDER_STATUSES, type OrderStatus } from "@/shared/enums";
import { CAMPUS_TIME_ZONE, formatCents, formatDateTime } from "@/shared/format";
import { adminOrdersQuerySchema } from "@/shared/schemas/admin";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;

function asList(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/** Every order (PRD ADM-6): filter by status or search by order number, customer name, or email. */
export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  await requirePageAccess("admin", "/admin/orders");
  const params = await props.searchParams;
  const statuses = asList(params.status).filter((s): s is OrderStatus =>
    (ORDER_STATUSES as readonly string[]).includes(s),
  );
  const q = typeof params.q === "string" && params.q.trim() ? params.q.trim() : undefined;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const filters = { status: statuses.length ? statuses : undefined, q, limit: PAGE_SIZE };

  let page;
  let badLink = false;
  try {
    page = await listAdminOrders(adminOrdersQuerySchema.parse({ ...filters, cursor }));
  } catch (error) {
    if (!(error instanceof AppError && error.code === "VALIDATION_ERROR")) throw error;
    badLink = true;
    page = await listAdminOrders(adminOrdersQuerySchema.parse(filters));
  }

  const keep = new URLSearchParams();
  for (const s of statuses) keep.append("status", s);
  if (q) keep.set("q", q);
  const nextHref = page.nextCursor
    ? `/admin/orders?${new URLSearchParams([...keep, ["cursor", page.nextCursor]])}`
    : null;

  return (
    <AdminPage title="Orders" intro="Every order on campus, newest first. Open one to see its full history.">
      <form method="get" action="/admin/orders" role="search" className="mt-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="order-search" className="block font-bold">
              Order number, customer name, or email
            </label>
            <input
              id="order-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              className="mt-1 block w-full rounded-control border border-line-strong bg-canvas px-3.5 py-2.5"
            />
          </div>
          <button type="submit" className={buttonClasses("primary")}>
            Search
          </button>
          {(q || statuses.length > 0) && (
            <Link
              href="/admin/orders"
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Clear filters
            </Link>
          )}
        </div>
        <fieldset>
          <legend className="font-bold">Status</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {ORDER_STATUSES.map((status) => (
              <label key={status} className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  name="status"
                  value={status}
                  defaultChecked={statuses.includes(status)}
                  className="size-5"
                />
                {ORDER_STATUS_LABEL[status]}
              </label>
            ))}
          </div>
        </fieldset>
      </form>

      {badLink && (
        <Notice tone="error" className="mt-4">
          That page link wasn&apos;t valid, so this shows the first page.
        </Notice>
      )}

      {page.data.length === 0 ? (
        <p className="mt-8 text-ink-muted">
          {q || statuses.length ? "No orders match these filters." : "No orders yet."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <caption className="sr-only">Orders, newest first</caption>
            <thead>
              <tr className="border-b border-line-strong">
                <th scope="col" className="py-2 pr-4 font-bold">
                  Order
                </th>
                <th scope="col" className="py-2 pr-4 font-bold">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-bold">
                  Restaurant
                </th>
                <th scope="col" className="py-2 pr-4 font-bold">
                  Customer
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-bold">
                  Total
                </th>
                <th scope="col" className="py-2 font-bold">
                  Placed
                </th>
              </tr>
            </thead>
            <tbody>
              {page.data.map((order) => (
                <tr key={order.id} className="border-b border-line align-top">
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-bold underline underline-offset-4"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="py-3 pr-4">{order.restaurantName}</td>
                  <td className="py-3 pr-4">
                    {order.customerName}
                    <span className="block text-sm break-all text-ink-muted">{order.customerEmail}</span>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatCents(order.totalCents)}</td>
                  <td className="py-3 whitespace-nowrap tabular-nums">
                    {formatDateTime(order.createdAt, CAMPUS_TIME_ZONE)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextHref && (
        <Link href={nextHref} className="mt-6 inline-block font-bold underline underline-offset-4">
          Show older orders
        </Link>
      )}
    </AdminPage>
  );
}
