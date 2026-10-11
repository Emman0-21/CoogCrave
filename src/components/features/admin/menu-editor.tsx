"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/shared/format";

/** Dollars as typed ("4", "4.5", "4.50") to cents, or null if it isn't a price. */
export function parseDollars(text: string): number | null {
  const match = /^\$?\s*(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

const MAX_CENTS = 10_000;

/** Open or close a restaurant for orders (PRD ADM-4). Reversible, so no confirmation step. */
export function AcceptingOrdersSwitch({
  restaurantId,
  restaurantName,
  isAcceptingOrders,
}: {
  restaurantId: string;
  restaurantName: string;
  isAcceptingOrders: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const result = await requestJson(`/api/v1/admin/restaurants/${restaurantId}`, {
      method: "PATCH",
      body: { isAcceptingOrders: !isAcceptingOrders },
    });
    setBusy(false);
    if (result.ok) router.refresh();
    else setError(result.error.message);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className={cn("font-bold", isAcceptingOrders ? "text-success-700" : "text-ink-muted")}>
        {isAcceptingOrders ? "Taking orders" : "Not taking orders"}
      </span>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void toggle()}
        aria-label={`${isAcceptingOrders ? "Stop" : "Start"} taking orders at ${restaurantName}`}
      >
        {isAcceptingOrders ? "Stop taking orders" : "Start taking orders"}
      </Button>
      {error && (
        <p role="alert" className="w-full text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** One menu item: change its price, or mark it sold out and back (PRD ADM-5). */
export function MenuItemEditor({
  item,
}: {
  item: { id: string; name: string; priceCents: number; isAvailable: boolean };
}) {
  const router = useRouter();
  const inputId = useId();
  const [price, setPrice] = useState((item.priceCents / 100).toFixed(2));
  // After a save the page reloads its data; show the saved price (React's "adjust state on prop change").
  const [shownPrice, setShownPrice] = useState(item.priceCents);
  if (shownPrice !== item.priceCents) {
    setShownPrice(item.priceCents);
    setPrice((item.priceCents / 100).toFixed(2));
  }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function save(body: { priceCents?: number; isAvailable?: boolean }, done: string) {
    setBusy(true);
    setMessage(null);
    const result = await requestJson(`/api/v1/admin/menu-items/${item.id}`, { method: "PATCH", body });
    setBusy(false);
    if (result.ok) {
      setMessage({ tone: "success", text: done });
      router.refresh();
    } else {
      setMessage({ tone: "error", text: result.error.message });
    }
  }

  function savePrice(event: React.FormEvent) {
    event.preventDefault();
    const cents = parseDollars(price);
    if (cents === null || cents > MAX_CENTS) {
      setMessage({ tone: "error", text: "Enter a price from $0.00 to $100.00, like 4.99." });
      return;
    }
    if (cents === item.priceCents) {
      setMessage({ tone: "success", text: "That's already the price." });
      return;
    }
    void save({ priceCents: cents }, `Now ${formatCents(cents)}.`);
  }

  const errorId = `${inputId}-message`;
  return (
    <li className="grid gap-x-6 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div>
        <p className={cn("font-bold", !item.isAvailable && "text-ink-muted line-through")}>{item.name}</p>
        {!item.isAvailable && <p className="text-sm font-bold text-danger-700">Sold out</p>}
        {message && (
          <p
            id={errorId}
            role={message.tone === "error" ? "alert" : "status"}
            className={cn("text-sm", message.tone === "error" ? "text-danger-700" : "text-ink-muted")}
          >
            {message.text}
          </p>
        )}
      </div>
      <form onSubmit={savePrice} className="flex items-end gap-2" noValidate>
        <div>
          <label htmlFor={inputId} className="block text-sm text-ink-muted">
            Price for {item.name}
          </label>
          <div className="flex items-center rounded-control border border-line-strong bg-canvas pl-3 focus-within:outline-2 focus-within:outline-ink">
            <span aria-hidden="true">$</span>
            <input
              id={inputId}
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-invalid={message?.tone === "error" ? true : undefined}
              aria-describedby={message ? errorId : undefined}
              className="w-20 bg-transparent px-1.5 py-2.5 tabular-nums outline-none"
            />
          </div>
        </div>
        <Button type="submit" variant="secondary" disabled={busy}>
          Save
        </Button>
      </form>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void save(
            { isAvailable: !item.isAvailable },
            item.isAvailable ? "Marked sold out." : "Back on the menu.",
          )
        }
        aria-label={item.isAvailable ? `Mark ${item.name} sold out` : `Put ${item.name} back on the menu`}
      >
        {item.isAvailable ? "Mark sold out" : "Back in stock"}
      </Button>
    </li>
  );
}
