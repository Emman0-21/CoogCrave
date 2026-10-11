"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { requestJson } from "@/client/api";
import { PriceBreakdown } from "@/components/features/cart/price-breakdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/notice";
import { formatCents, formatTime } from "@/shared/format";
import type { OrderDetailView } from "@/shared/schemas/ordering";

import { HAPPY_PATH, STATUS_LABEL, STATUS_NEXT } from "./status-text";

const POLL_MS = 5_000;
const TERMINAL = new Set(["DELIVERED", "CANCELLED", "DELIVERY_FAILED"]);

/**
 * Order tracking (PRD TRK-1…3). Refreshes every 5 seconds while the order is in progress and the tab
 * is visible, and stops for good once it reaches a final status. No map, no invented ETA: only the
 * steps that actually happened, with their times.
 */
export function OrderTracker({ initial, timeZone }: { initial: OrderDetailView; timeZone: string }) {
  const router = useRouter();
  const [order, setOrder] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = TERMINAL.has(order.status);

  useEffect(() => {
    if (finished) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const poll = async () => {
      if (document.visibilityState === "visible") {
        const result = await requestJson<OrderDetailView>(`/api/v1/orders/${initial.id}`);
        if (result.ok && !stopped) setOrder(result.data);
      }
      if (!stopped) timer = setTimeout(() => void poll(), POLL_MS);
    };
    timer = setTimeout(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && timer) {
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [finished, initial.id]);

  const canCancel = order.allowedTransitions.some((t) => t.toStatus === "CANCELLED" && !t.reasonRequired);

  async function cancel() {
    setBusy(true);
    setError(null);
    const result = await requestJson<OrderDetailView>(`/api/v1/orders/${order.id}/transitions`, {
      body: { toStatus: "CANCELLED", expectedVersion: order.version },
    });
    setBusy(false);
    setConfirming(false);
    if (result.ok) {
      setOrder(result.data);
      router.refresh();
      return;
    }
    setError(result.error.message);
    const fresh = await requestJson<OrderDetailView>(`/api/v1/orders/${order.id}`);
    if (fresh.ok) setOrder(fresh.data);
  }

  const reached = new Map(order.timeline.map((t) => [t.status, t.at]));
  const steps =
    order.status === "CANCELLED" || order.status === "DELIVERY_FAILED"
      ? [...order.timeline.map((t) => t.status)]
      : HAPPY_PATH;

  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section aria-labelledby="status-heading">
        <h2 id="status-heading" className="sr-only">
          Status
        </h2>
        <p role="status" aria-live="polite" className="font-display text-3xl font-extrabold">
          {STATUS_LABEL[order.status]}
        </p>
        <p className="mt-2 text-lg text-ink-muted">{STATUS_NEXT[order.status]}</p>

        <ol aria-label="Order progress" className="mt-8 space-y-0">
          {steps.map((status, index) => {
            const at = reached.get(status);
            const current = status === order.status;
            return (
              <li
                key={`${status}-${index}`}
                aria-current={current ? "step" : undefined}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1 size-4 shrink-0 rounded-full border-2",
                      current
                        ? "border-action bg-action"
                        : at
                          ? "border-ink bg-ink"
                          : "border-line-strong bg-canvas",
                    )}
                  />
                  {index < steps.length - 1 && (
                    <span aria-hidden="true" className="w-0.5 flex-1 bg-line-strong" />
                  )}
                </div>
                <div className="pb-6">
                  <p className={cn(current ? "font-bold text-action" : at ? "font-bold" : "text-ink-muted")}>
                    {STATUS_LABEL[status]}
                    {!at && <span className="sr-only"> (not yet)</span>}
                  </p>
                  {at && <p className="text-sm text-ink-muted">{formatTime(at, timeZone)}</p>}
                </div>
              </li>
            );
          })}
        </ol>

        {!finished && (
          <p className="max-w-prose text-sm text-ink-muted">
            This page updates on its own. Restaurant steps are simulated in this demo and run from the
            CoogCrave Kitchen Console, which arrives in a later release.
          </p>
        )}

        {error && (
          <Notice tone="error" className="mt-6">
            {error}
          </Notice>
        )}
        {canCancel && (
          <div className="mt-6">
            {confirming ? (
              <div
                role="group"
                aria-label="Confirm cancellation"
                className="flex flex-wrap items-center gap-3"
              >
                <p className="w-full font-bold">
                  Cancel this order? The restaurant hasn&apos;t started on it yet.
                </p>
                <Button onClick={() => void cancel()} disabled={busy}>
                  {busy ? "Cancelling…" : "Yes, cancel order"}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                  Keep order
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Cancel order
              </Button>
            )}
          </div>
        )}
      </section>

      <section
        aria-labelledby="receipt-heading"
        className="self-start rounded-ticket bg-surface px-5 pt-8 pb-8 ticket-edges"
      >
        <h2 id="receipt-heading" className="font-display text-xl font-extrabold">
          {order.restaurant.name}
        </h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">Pickup</dt>
          <dd>{order.restaurant.pickupLocation}</dd>
          <dt className="text-ink-muted">Drop-off</dt>
          <dd className="font-bold">{order.deliveryLocation.name}</dd>
          {order.deliveryInstructions && (
            <>
              <dt className="text-ink-muted">Note</dt>
              <dd>{order.deliveryInstructions}</dd>
            </>
          )}
        </dl>
        <ul className="mt-5 space-y-2 border-t border-dashed border-line-strong pt-4">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>
                {item.quantity}× {item.name}
                {item.options.length > 0 && (
                  <span className="block text-sm text-ink-muted">
                    {item.options.map((o) => o.name).join(", ")}
                  </span>
                )}
              </span>
              <span>{formatCents(item.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <PriceBreakdown price={order.price} className="mt-4 border-t border-dashed border-line-strong pt-3" />
        <p className="mt-4 text-sm text-ink-muted">
          {order.payment.status === "VOIDED"
            ? "Demo payment released. Nothing was charged."
            : "Demo payment. Nothing was charged."}
        </p>
      </section>
    </div>
  );
}
