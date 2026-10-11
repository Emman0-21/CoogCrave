"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { requestJson, retryAfterText } from "@/client/api";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatCents } from "@/shared/format";
import type { OrderDetailView, QuoteView } from "@/shared/schemas/ordering";
import type { LocationResponse } from "@/shared/schemas/profile";

import { PriceBreakdown } from "./price-breakdown";

const TIP_PRESETS = [0, 100, 200, 300, 500];
const INSTRUCTIONS_MAX = 280;

/**
 * Checkout (PRD ORD-1…4). Totals always come from the server's quote. The Idempotency-Key is made once
 * per visit to this page and reused if the request is retried, so a double click or a flaky connection
 * can't place two orders.
 */
export function CheckoutForm({
  locations,
  defaultLocationId,
}: {
  locations: LocationResponse[];
  defaultLocationId: string | null;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [tipCents, setTipCents] = useState(200);
  const [instructions, setInstructions] = useState("");
  const [latestQuote, setQuote] = useState<QuoteView | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [locationError, setLocationError] = useState<string | undefined>();

  // Re-quote whenever the building or tip changes. A slower, older response never overwrites a newer one.
  useEffect(() => {
    if (!locationId) return;
    let current = true;
    void requestJson<QuoteView>("/api/v1/checkout/quote", {
      body: { deliveryLocationId: locationId, tipCents },
    }).then((result) => {
      if (!current) return;
      setQuote(result.ok ? result.data : null);
      setQuoteError(result.ok ? null : result.error.message);
    });
    return () => {
      current = false;
    };
  }, [locationId, tipCents]);

  const quote = locationId ? latestQuote : null;

  async function placeOrder() {
    setMessage(null);
    if (!locationId) {
      setLocationError("Choose where to bring your order.");
      document.getElementById("deliveryLocationId")?.focus();
      return;
    }
    if (!quote) return;
    setPlacing(true);
    const result = await requestJson<OrderDetailView>("/api/v1/orders", {
      body: {
        deliveryLocationId: locationId,
        deliveryInstructions: instructions.trim() || null,
        tipCents,
        expectedTotalCents: quote.totalCents,
      },
      headers: { "idempotency-key": idempotencyKey.current },
    });
    if (result.ok) {
      router.push(`/orders/${result.data.id}?placed=1`);
      router.refresh();
      return;
    }
    setPlacing(false);
    const { code } = result.error;
    if (code === "PRICE_CHANGED") {
      const fresh = (result.error.details as { quote?: QuoteView } | undefined)?.quote;
      if (fresh) setQuote(fresh);
      setMessage({
        tone: "info",
        text: "Prices changed while you were here. Check the new total, then place your order.",
      });
    } else if (code === "RATE_LIMITED") {
      setMessage({
        tone: "error",
        text: `Too many attempts. ${retryAfterText(result.error.retryAfterSeconds)}`,
      });
    } else {
      setMessage({ tone: "error", text: result.error.message });
    }
  }

  const blocked = quote ? !quote.canPlaceOrder : true;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void placeOrder();
      }}
      className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
    >
      <div className="space-y-6">
        <SelectField
          id="deliveryLocationId"
          label="Drop-off building"
          hint="Your courier meets you at the entrance."
          error={locationError}
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setLocationError(undefined);
          }}
        >
          <option value="">Choose a building</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          id="deliveryInstructions"
          label="Instructions for your courier (optional)"
          hint="For example, which door or floor. Couriers see this only while delivering."
          maxLength={INSTRUCTIONS_MAX}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
        />

        <fieldset>
          <legend className="font-bold">Courier tip</legend>
          <p className="text-sm text-ink-muted">
            All of the tip goes to the student who delivers (simulated in this demo).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TIP_PRESETS.map((cents) => (
              <label
                key={cents}
                className="cursor-pointer rounded-full border border-line-strong px-4 py-2 has-checked:border-ink has-checked:bg-ink has-checked:text-canvas has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-action"
              >
                <input
                  type="radio"
                  name="tip"
                  value={cents}
                  checked={tipCents === cents}
                  onChange={() => setTipCents(cents)}
                  className="sr-only"
                />
                {cents === 0 ? "No tip" : formatCents(cents)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <section
        aria-labelledby="summary-heading"
        className="self-start rounded-ticket bg-surface px-5 pt-8 pb-8 ticket-edges"
      >
        <h2 id="summary-heading" className="font-display text-xl font-extrabold">
          Order summary
        </h2>
        {quote ? (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              {quote.restaurant.name}, {quote.lines.reduce((n, l) => n + l.quantity, 0)} items
            </p>
            <PriceBreakdown price={quote} className="mt-4" />
          </>
        ) : (
          <p className="mt-3 text-ink-muted">
            {locationId
              ? (quoteError ?? "Working out your total…")
              : "Choose a drop-off building to see your total."}
          </p>
        )}

        <Notice tone="info" className="mt-6">
          <strong>Demo checkout. No real payment is taken.</strong> No card is needed.
        </Notice>

        {quote && quote.problems.length > 0 && (
          <Notice tone="error" className="mt-4">
            Something in your cart needs attention.{" "}
            <Link href="/cart" className="font-bold underline underline-offset-4">
              Review your cart
            </Link>
          </Notice>
        )}
        {message && (
          <Notice tone={message.tone} className="mt-4">
            {message.text}
          </Notice>
        )}

        <Button type="submit" className="mt-6 w-full" disabled={placing || (Boolean(locationId) && blocked)}>
          {placing
            ? "Placing order…"
            : quote
              ? `Place order, ${formatCents(quote.totalCents)}`
              : "Place order"}
        </Button>
      </section>
    </form>
  );
}
