"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { requestJson } from "@/client/api";
import { Button, buttonClasses } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatCents } from "@/shared/format";
import type { CartView, MenuItemView, MenuOptionGroupView } from "@/shared/schemas/ordering";

const SPECIAL_INSTRUCTIONS_MAX = 140;

/** "Choose 1", "Choose up to 3", "Choose 1 to 2", "Optional". */
function groupRule(group: MenuOptionGroupView): string {
  if (group.minSelect === group.maxSelect) return `Choose ${group.minSelect}`;
  if (group.minSelect === 0) return group.maxSelect === 1 ? "Optional" : `Choose up to ${group.maxSelect}`;
  return `Choose ${group.minSelect} to ${group.maxSelect}`;
}

/** Problems with the current choices, checked in the browser for quick feedback (the server checks again). */
function selectionProblems(groups: MenuOptionGroupView[], chosen: Set<string>): Map<string, string> {
  const problems = new Map<string, string>();
  for (const group of groups) {
    const count = group.options.filter((o) => chosen.has(o.id)).length;
    if (count < group.minSelect) {
      problems.set(
        group.id,
        group.minSelect === 1
          ? `Choose a ${group.name.toLowerCase()}.`
          : `Choose at least ${group.minSelect}.`,
      );
    }
  }
  return problems;
}

type Outcome =
  | { kind: "added"; count: number }
  | { kind: "conflict"; currentRestaurant: string }
  | { kind: "error"; message: string };

/**
 * "Add" button for a menu item. Items with choices open a dialog (native <dialog>: focus moves into it,
 * Escape closes it, and the page behind is inert). Items without choices still open it, so quantity and
 * a note can be set the same way everywhere.
 */
export function AddToCart({
  item,
  restaurant,
  canOrder,
  signedIn,
}: {
  item: MenuItemView;
  restaurant: { name: string; slug: string };
  canOrder: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (!item.isAvailable) {
    return <span className="font-bold text-ink-muted sm:justify-self-end">Sold out today</span>;
  }
  if (!signedIn) {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(`/restaurants/${restaurant.slug}`)}`}
        className={buttonClasses("secondary", "sm:justify-self-end")}
      >
        Sign in to order
      </Link>
    );
  }
  if (!canOrder) return null;

  const unitCents =
    item.priceCents +
    item.optionGroups
      .flatMap((g) => g.options)
      .reduce((sum, o) => sum + (chosen.has(o.id) ? o.priceDeltaCents : 0), 0);
  const problems = selectionProblems(item.optionGroups, chosen);

  function open() {
    setChosen(new Set());
    setQuantity(1);
    setNote("");
    setShowProblems(false);
    setOutcome(null);
    dialogRef.current?.showModal();
  }

  function toggle(group: MenuOptionGroupView, optionId: string, checked: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (group.maxSelect === 1) group.options.forEach((o) => next.delete(o.id));
      if (checked) next.add(optionId);
      else next.delete(optionId);
      return next;
    });
  }

  async function submit(replaceCart: boolean) {
    if (problems.size > 0) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    setOutcome(null);
    const result = await requestJson<CartView>("/api/v1/cart/items", {
      body: {
        menuItemId: item.id,
        quantity,
        optionIds: [...chosen],
        specialInstructions: note || null,
        replaceCart,
      },
    });
    setBusy(false);
    if (result.ok) {
      dialogRef.current?.close();
      setOutcome({ kind: "added", count: quantity });
      router.refresh();
      return;
    }
    if (result.error.code === "CART_RESTAURANT_CONFLICT") {
      const details = result.error.details as { currentRestaurant?: { name?: string } } | undefined;
      setOutcome({
        kind: "conflict",
        currentRestaurant: details?.currentRestaurant?.name ?? "another restaurant",
      });
      return;
    }
    setOutcome({ kind: "error", message: result.error.message });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button variant="secondary" onClick={open} aria-label={`Add ${item.name}`}>
        Add
      </Button>
      {outcome?.kind === "added" && (
        <p role="status" className="text-sm text-success-700">
          Added {outcome.count} to your cart.{" "}
          <Link href="/cart" className="font-bold underline underline-offset-4">
            View cart
          </Link>
        </p>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-ticket bg-canvas p-0 text-ink shadow-[0_8px_40px_rgb(36_38_43/0.25)] backdrop:bg-asphalt-900/50"
      >
        <form
          method="dialog"
          className="max-h-[calc(100dvh-4rem)] space-y-6 overflow-y-auto px-6 pt-7 pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
        >
          <div>
            <h2 id={titleId} className="font-display text-2xl font-extrabold">
              {item.name}
            </h2>
            {item.description && <p className="mt-1 text-ink-muted">{item.description}</p>}
            <p className="mt-1">{formatCents(item.priceCents)}</p>
          </div>

          {item.optionGroups.map((group) => {
            const single = group.maxSelect === 1 && group.minSelect === 1;
            const count = group.options.filter((o) => chosen.has(o.id)).length;
            const problem = showProblems ? problems.get(group.id) : undefined;
            return (
              <fieldset key={group.id} aria-describedby={problem ? `${group.id}-problem` : undefined}>
                <legend className="font-bold">
                  {group.name} <span className="font-normal text-ink-muted">({groupRule(group)})</span>
                </legend>
                {problem && (
                  <p id={`${group.id}-problem`} className="mt-1 text-sm font-bold text-danger-700">
                    {problem}
                  </p>
                )}
                <div className="mt-2 space-y-1">
                  {group.options.map((option) => {
                    const checked = chosen.has(option.id);
                    const atMax = !single && !checked && count >= group.maxSelect;
                    return (
                      <label
                        key={option.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 has-disabled:cursor-not-allowed has-disabled:text-ink-muted"
                      >
                        <input
                          type={single ? "radio" : "checkbox"}
                          name={group.id}
                          checked={checked}
                          disabled={!option.isAvailable || atMax}
                          onChange={(e) => toggle(group, option.id, e.target.checked)}
                          className="size-5 accent-action"
                        />
                        <span className="flex-1">
                          {option.name}
                          {!option.isAvailable && " (unavailable)"}
                        </span>
                        {option.priceDeltaCents > 0 && <span>+{formatCents(option.priceDeltaCents)}</span>}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <div className="space-y-1.5">
            <span id={`${titleId}-qty`} className="block font-bold">
              Quantity
            </span>
            <div role="group" aria-labelledby={`${titleId}-qty`} className="inline-flex items-center gap-3">
              <Button
                variant="secondary"
                className="size-11 px-0"
                aria-label="One fewer"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                −
              </Button>
              <output aria-live="polite" className="min-w-8 text-center text-lg font-bold">
                {quantity}
              </output>
              <Button
                variant="secondary"
                className="size-11 px-0"
                aria-label="One more"
                disabled={quantity >= 20}
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              >
                +
              </Button>
            </div>
          </div>

          <TextAreaField
            id={`${titleId}-note`}
            label="Note for the restaurant (optional)"
            maxLength={SPECIAL_INSTRUCTIONS_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />

          {outcome?.kind === "conflict" && (
            <Notice tone="info">
              <p>
                Your cart has items from {outcome.currentRestaurant}. An order comes from one restaurant, so
                adding this starts a new cart.
              </p>
              <Button className="mt-2" disabled={busy} onClick={() => void submit(true)}>
                Start a new cart
              </Button>
            </Notice>
          )}
          {outcome?.kind === "error" && <Notice tone="error">{outcome.message}</Notice>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <Button variant="quiet" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : `Add to cart, ${formatCents(unitCents * quantity)}`}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
