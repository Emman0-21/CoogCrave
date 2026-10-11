"use client";

import { useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { TextAreaField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ReviewView } from "@/shared/schemas/engagement";

const RATINGS = [1, 2, 3, 4, 5] as const;
const WORDS: Record<(typeof RATINGS)[number], string> = {
  1: "Poor",
  2: "Not great",
  3: "OK",
  4: "Good",
  5: "Great",
};

/** Stars as text, so the rating reads the same with or without color. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("tracking-[0.15em] text-action", className)} aria-hidden="true">
      {"★".repeat(rating)}
      <span className="text-line-strong">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/**
 * Rate a delivered order once (PRD REV-1). The rating goes to the courier who delivered it; the comment
 * is visible to admins only (couriers see the stars).
 */
export function ReviewPanel({
  orderId,
  courierFirstName,
  review,
  onReviewed,
}: {
  orderId: string;
  courierFirstName: string | null;
  review: ReviewView | null;
  onReviewed: (review: ReviewView) => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (review) {
    return (
      <section aria-labelledby="review-heading" className="mt-8 border-t border-line pt-6">
        <h2 id="review-heading" className="font-bold">
          Your rating
        </h2>
        <p className="mt-1 text-lg">
          <Stars rating={review.rating} />{" "}
          <span>
            {review.rating} out of 5, {WORDS[review.rating as keyof typeof WORDS].toLowerCase()}
          </span>
        </p>
        {review.comment && <p className="mt-1 max-w-prose text-ink-muted">“{review.comment}”</p>}
        <p className="mt-2 text-sm text-ink-muted">Thanks. Ratings help keep campus deliveries good.</p>
      </section>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating === null) {
      setError("Choose 1 to 5 stars.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestJson<ReviewView>(`/api/v1/orders/${orderId}/review`, {
      body: { rating, comment: comment.trim() === "" ? null : comment },
    });
    setBusy(false);
    if (result.ok) onReviewed(result.data);
    else setError(result.error.message);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4 border-t border-line pt-6" noValidate>
      <fieldset>
        <legend className="font-bold">
          How was the delivery{courierFirstName ? ` from ${courierFirstName}` : ""}?
        </legend>
        <div className="mt-2 flex gap-1">
          {RATINGS.map((value) => {
            const filled = rating !== null && value <= rating;
            return (
              <label key={value} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                  aria-label={`${value} ${value === 1 ? "star" : "stars"}, ${WORDS[value].toLowerCase()}`}
                  className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-11 place-items-center rounded-control text-3xl leading-none",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
                    filled ? "text-action" : "text-line-strong hover:text-ink-muted",
                  )}
                >
                  ★
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 min-h-6 text-sm text-ink-muted" aria-live="polite">
          {rating !== null ? WORDS[rating as keyof typeof WORDS] : ""}
        </p>
      </fieldset>
      <TextAreaField
        id="review-comment"
        label="Anything to add? (optional)"
        hint="Only CoogCrave admins read comments."
        maxLength={500}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="max-w-prose"
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send rating"}
      </Button>
    </form>
  );
}
