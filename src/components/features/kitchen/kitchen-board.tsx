"use client";

import { useEffect, useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatTime } from "@/shared/format";
import type { OrderStatus } from "@/shared/enums";
import type { KitchenOrderView } from "@/shared/schemas/delivery";

const POLL_MS = 10_000;

const COLUMNS: { status: OrderStatus; title: string; empty: string }[] = [
  { status: "PLACED", title: "New", empty: "No new orders." },
  { status: "CONFIRMED", title: "Preparing", empty: "Nothing being prepared." },
  { status: "READY_FOR_PICKUP", title: "Waiting for a courier", empty: "Nothing waiting on the shelf." },
];

/**
 * Kitchen Console (PRD ADM-7). SIMULATION: an admin plays the restaurant. Every button sends a status
 * change with `actingAs: "RESTAURANT_SIM"`, which the server records as a simulated restaurant action
 * and audits with the admin's name.
 */
export function KitchenBoard({ initial, timeZone }: { initial: KitchenOrderView[]; timeZone: string }) {
  const [orders, setOrders] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let current = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await requestJson<{ data: KitchenOrderView[] }>("/api/v1/admin/kitchen");
      if (result.ok && current) setOrders(result.data.data);
    };
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);

  async function act(order: KitchenOrderView, toStatus: OrderStatus, why?: string) {
    setBusy(order.id);
    setMessage(null);
    const result = await requestJson<KitchenOrderView>(`/api/v1/orders/${order.id}/transitions`, {
      body: {
        toStatus,
        actingAs: "RESTAURANT_SIM",
        expectedVersion: order.version,
        ...(why ? { reason: why } : {}),
      },
    });
    setBusy(null);
    const list = await requestJson<{ data: KitchenOrderView[] }>("/api/v1/admin/kitchen");
    if (list.ok) setOrders(list.data.data);
    if (result.ok) {
      setRejecting(null);
      setReason("");
      const done: Partial<Record<OrderStatus, string>> = {
        CONFIRMED: "confirmed",
        READY_FOR_PICKUP: "marked ready",
        CANCELLED: "rejected",
      };
      setMessage({ tone: "success", text: `Order ${order.orderNumber} ${done[toStatus] ?? "updated"}.` });
    } else {
      setMessage({ tone: "error", text: result.error.message });
    }
  }

  return (
    <div>
      <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const inColumn = orders.filter((o) => o.status === column.status);
          return (
            <section key={column.status} aria-labelledby={`col-${column.status}`}>
              <h2 id={`col-${column.status}`} className="font-display text-xl font-extrabold">
                {column.title}{" "}
                <span className="font-sans text-base font-normal text-ink-muted">({inColumn.length})</span>
              </h2>
              {inColumn.length === 0 ? (
                <p className="mt-3 text-ink-muted">{column.empty}</p>
              ) : (
                <ul className="mt-3 space-y-4">
                  {inColumn.map((order) => (
                    <li key={order.id} className="rounded-ticket bg-surface px-4 pt-5 pb-5 ticket-edges">
                      <article aria-label={`Order ${order.orderNumber}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="font-bold">{order.orderNumber}</h3>
                          <span className="text-sm text-ink-muted">
                            {formatTime(order.placedAt, timeZone)}
                          </span>
                        </div>
                        <p className="text-sm text-ink-muted">
                          {order.restaurantName}. To {order.dropLocation}.
                        </p>
                        <ul className="mt-3 space-y-1 border-t border-dashed border-line-strong pt-3">
                          {order.items.map((item, i) => (
                            <li key={i}>
                              {item.quantity}× {item.name}
                              {item.options.length > 0 && (
                                <span className="block text-sm text-ink-muted">
                                  {item.options.join(", ")}
                                </span>
                              )}
                              {item.specialInstructions && (
                                <span className="block text-sm">Note: {item.specialInstructions}</span>
                              )}
                            </li>
                          ))}
                        </ul>

                        {order.status !== "READY_FOR_PICKUP" &&
                          (rejecting === order.id ? (
                            <form
                              className="mt-4 space-y-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void act(order, "CANCELLED", reason);
                              }}
                            >
                              <label htmlFor={`reason-${order.id}`} className="block text-sm font-bold">
                                Reason for the customer
                              </label>
                              <input
                                id={`reason-${order.id}`}
                                value={reason}
                                maxLength={300}
                                required
                                onChange={(e) => setReason(e.target.value)}
                                className="block w-full rounded-control border border-line-strong bg-canvas px-3 py-2"
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button type="submit" disabled={busy === order.id || !reason.trim()}>
                                  Reject order
                                </Button>
                                <Button variant="secondary" onClick={() => setRejecting(null)}>
                                  Keep it
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {order.status === "PLACED" ? (
                                <Button
                                  disabled={busy === order.id}
                                  onClick={() => void act(order, "CONFIRMED")}
                                >
                                  Confirm
                                </Button>
                              ) : (
                                <Button
                                  disabled={busy === order.id}
                                  onClick={() => void act(order, "READY_FOR_PICKUP")}
                                >
                                  Mark ready
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                disabled={busy === order.id}
                                onClick={() => {
                                  setRejecting(order.id);
                                  setReason("");
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          ))}
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
