"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatCents, formatTime } from "@/shared/format";
import type { OrderStatus } from "@/shared/enums";
import type { CourierOrderView, OfferView } from "@/shared/schemas/delivery";

const POLL_MS = 10_000;

type Message = { tone: "error" | "success" | "info"; text: string } | null;

/** Offers, refreshed every 10 seconds while the tab is visible (ARCHITECTURE §11). */
function OfferList({ initial, onAccepted }: { initial: OfferView[]; onAccepted: () => void }) {
  const [offers, setOffers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function reload() {
    const result = await requestJson<{ data: OfferView[] }>("/api/v1/courier/offers");
    if (result.ok) setOffers(result.data.data);
  }

  useEffect(() => {
    let current = true;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void requestJson<{ data: OfferView[] }>("/api/v1/courier/offers").then((result) => {
        if (current && result.ok) setOffers(result.data.data);
      });
    }, POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);

  async function accept(offer: OfferView) {
    setBusy(offer.orderId);
    setMessage(null);
    const result = await requestJson<CourierOrderView>(`/api/v1/orders/${offer.orderId}/transitions`, {
      body: { toStatus: "ASSIGNED" },
    });
    setBusy(null);
    if (result.ok) {
      onAccepted();
      return;
    }
    setMessage({ tone: "error", text: result.error.message });
    await reload();
  }

  async function decline(offer: OfferView) {
    setBusy(offer.orderId);
    await requestJson(`/api/v1/courier/offers/${offer.orderId}/decline`, { method: "POST", body: {} });
    setBusy(null);
    setOffers((list) => list.filter((o) => o.orderId !== offer.orderId));
  }

  return (
    <section aria-labelledby="offers-heading" className="mt-8">
      <h2 id="offers-heading" className="font-display text-2xl font-extrabold">
        Deliveries ready now
      </h2>
      <div aria-live="polite">
        {message && (
          <Notice tone={message.tone} className="mt-4">
            {message.text}
          </Notice>
        )}
      </div>
      {offers.length === 0 ? (
        <p className="mt-3 text-ink-muted">
          Nothing ready right now. This list checks again every few seconds.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {offers.map((offer) => (
            <li
              key={offer.orderId}
              className="grid gap-x-6 gap-y-2 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div>
                <p className="text-lg font-bold">{offer.restaurantName}</p>
                <p>
                  {offer.pickupLocation} <span aria-hidden="true">to</span>
                  <span className="sr-only">, deliver to</span> {offer.dropLocation}
                </p>
                <p className="text-sm text-ink-muted">
                  {offer.itemCount} {offer.itemCount === 1 ? "item" : "items"}. You&apos;d earn{" "}
                  {formatCents(offer.estimatedPayoutCents)} (simulated).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy !== null}
                  onClick={() => void accept(offer)}
                  aria-label={`Accept delivery from ${offer.restaurantName}`}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void decline(offer)}
                  aria-label={`Skip delivery from ${offer.restaurantName}`}
                >
                  Skip
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const NEXT_STEP: Partial<Record<OrderStatus, string>> = {
  ASSIGNED: "Head to the restaurant and pick up the order.",
  PICKED_UP: "Bring it to the customer at the building entrance.",
};

/** The courier's current delivery, with only the moves the server says are allowed (PRD DLV-7…9). */
function ActiveDelivery({
  delivery,
  timeZone,
  onChanged,
}: {
  delivery: CourierOrderView;
  timeZone: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [giving, setGiving] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const can = (s: OrderStatus) => delivery.allowedTransitions.some((t) => t.toStatus === s);

  async function move(toStatus: OrderStatus, why?: string) {
    setBusy(true);
    setMessage(null);
    const result = await requestJson<CourierOrderView>(`/api/v1/orders/${delivery.id}/transitions`, {
      body: { toStatus, expectedVersion: delivery.version, ...(why ? { reason: why } : {}) },
    });
    setBusy(false);
    if (result.ok) {
      setGiving(null);
      onChanged();
    } else {
      setMessage({ tone: "error", text: result.error.message });
    }
  }

  return (
    <section
      aria-labelledby="active-heading"
      className="mt-8 rounded-ticket bg-surface px-5 pt-8 pb-8 ticket-edges sm:px-7"
    >
      <h2 id="active-heading" className="font-display text-2xl font-extrabold">
        Your delivery: <span className="whitespace-nowrap">{delivery.orderNumber}</span>
      </h2>
      <p role="status" className="mt-1 text-lg">
        {NEXT_STEP[delivery.status] ?? "Delivery updated."}
      </p>

      <dl className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">Pick up</dt>
        <dd>
          <span className="font-bold">{delivery.restaurant.name}</span>, {delivery.restaurant.pickupLocation}
          {delivery.restaurant.pickupNotes && (
            <span className="block text-sm text-ink-muted">{delivery.restaurant.pickupNotes}</span>
          )}
        </dd>
        <dt className="text-ink-muted">Deliver to</dt>
        <dd>
          <span className="font-bold">{delivery.customerName}</span> at {delivery.deliveryLocation.name}
        </dd>
        {delivery.deliveryInstructions && (
          <>
            <dt className="text-ink-muted">Customer&apos;s note</dt>
            <dd>{delivery.deliveryInstructions}</dd>
          </>
        )}
        <dt className="text-ink-muted">Accepted</dt>
        <dd>{formatTime(delivery.assignment.assignedAt, timeZone)}</dd>
        <dt className="text-ink-muted">You&apos;ll earn</dt>
        <dd>{formatCents(delivery.payoutCents)} (simulated, nobody is paid)</dd>
      </dl>

      <h3 className="mt-5 font-bold">Items</h3>
      <ul className="mt-1 space-y-1">
        {delivery.items.map((item, i) => (
          <li key={i}>
            {item.quantity}× {item.name}
            {item.options.length > 0 && <span className="text-ink-muted"> ({item.options.join(", ")})</span>}
          </li>
        ))}
      </ul>

      {message && (
        <Notice tone={message.tone} className="mt-5">
          {message.text}
        </Notice>
      )}

      {giving ? (
        <form
          className="mt-6 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void move(giving, reason);
          }}
        >
          <label htmlFor="courier-reason" className="block font-bold">
            {giving === "READY_FOR_PICKUP" ? "Why are you giving it back?" : "What went wrong?"}
          </label>
          <input
            id="courier-reason"
            value={reason}
            maxLength={300}
            required
            onChange={(e) => setReason(e.target.value)}
            className="block w-full rounded-control border border-line-strong bg-canvas px-3.5 py-2.5"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !reason.trim()}>
              {giving === "READY_FOR_PICKUP" ? "Give it back" : "Report the problem"}
            </Button>
            <Button variant="secondary" onClick={() => setGiving(null)}>
              Never mind
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          {can("PICKED_UP") && (
            <Button disabled={busy} onClick={() => void move("PICKED_UP")}>
              I picked it up
            </Button>
          )}
          {can("DELIVERED") && (
            <Button disabled={busy} onClick={() => void move("DELIVERED")}>
              Delivered
            </Button>
          )}
          {can("READY_FOR_PICKUP") && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setGiving("READY_FOR_PICKUP");
                setReason("");
              }}
            >
              Give it back
            </Button>
          )}
          {can("DELIVERY_FAILED") && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setGiving("DELIVERY_FAILED");
                setReason("");
              }}
            >
              Couldn&apos;t deliver
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** Courier home (PRD DLV-2…9): online switch, then either the current delivery or the offers. */
export function CourierDashboard({
  isOnline,
  active,
  offers,
  timeZone,
}: {
  isOnline: boolean;
  active: CourierOrderView | null;
  offers: OfferView[];
  timeZone: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setOnline(online: boolean) {
    setBusy(true);
    setError(null);
    const result = await requestJson("/api/v1/courier/availability", { method: "PUT", body: { online } });
    setBusy(false);
    if (result.ok) router.refresh();
    else setError(result.error.message);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="inline-flex items-center gap-2 text-lg font-bold">
          <span
            aria-hidden="true"
            className={
              isOnline
                ? "size-3 rounded-full bg-success-700"
                : "size-3 rounded-full border-2 border-line-strong"
            }
          />
          {isOnline ? "You're online" : "You're offline"}
        </p>
        <Button
          variant={isOnline ? "secondary" : "primary"}
          disabled={busy}
          onClick={() => void setOnline(!isOnline)}
        >
          {isOnline ? "Go offline" : "Go online"}
        </Button>
      </div>
      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}

      {active ? (
        <ActiveDelivery delivery={active} timeZone={timeZone} onChanged={() => router.refresh()} />
      ) : isOnline ? (
        <OfferList initial={offers} onAccepted={() => router.refresh()} />
      ) : (
        <p className="mt-8 text-ink-muted">Go online to see deliveries that are ready for pickup.</p>
      )}
      {active && !isOnline && (
        <p className="mt-4 text-sm text-ink-muted">
          You&apos;re offline, so you won&apos;t get new deliveries. Finish this one as usual.
        </p>
      )}
    </div>
  );
}
