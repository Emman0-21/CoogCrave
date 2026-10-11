import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderTracker } from "@/components/features/orders/order-tracker";
import { Notice } from "@/components/ui/notice";
import { requirePageAccess } from "@/server/auth/page-guards";
import { AppError } from "@/server/http/errors";
import { getOrder } from "@/server/services/orders";
import { CAMPUS_TIME_ZONE, formatDateTime } from "@/shared/format";

export const metadata: Metadata = { title: "Your order" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Order confirmation and tracking (PRD ORD-7, TRK-1). Someone else's order is a 404, like a missing one. */
export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[orderId]">) {
  const { orderId } = await params;
  const actor = await requirePageAccess("user", `/orders/${orderId}`);
  if (!UUID.test(orderId)) notFound();
  const justPlaced = (await searchParams).placed === "1";

  let order;
  try {
    order = await getOrder(actor, orderId);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      {justPlaced && (
        <Notice tone="success" className="mb-8">
          <strong>Order placed.</strong> We&apos;ll keep this page up to date as it moves along.
        </Notice>
      )}
      <p className="text-ink-muted">
        <Link href="/orders" className="underline underline-offset-4">
          Your orders
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">
        Order {order.orderNumber}
      </h1>
      <p className="mt-2 mb-10 text-ink-muted">Placed {formatDateTime(order.createdAt, CAMPUS_TIME_ZONE)}</p>
      <OrderTracker initial={order} timeZone={CAMPUS_TIME_ZONE} />
    </main>
  );
}
