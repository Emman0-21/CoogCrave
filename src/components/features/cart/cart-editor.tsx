"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatCents } from "@/shared/format";
import type { CartView } from "@/shared/schemas/ordering";

import { itemProblemText } from "./problem-text";

/** Cart lines with quantity and remove controls. Every change goes to the server, then the page reloads its data. */
export function CartEditor({ cart }: { cart: CartView }) {
  const router = useRouter();
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(lineId: string, request: Promise<{ ok: boolean; error?: { message: string } }>) {
    setBusyLine(lineId);
    setError(null);
    const result = await request;
    setBusyLine(null);
    if (!result.ok) setError(result.error?.message ?? "That didn't work. Try again.");
    router.refresh();
  }

  return (
    <div>
      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}
      <ul className="divide-y divide-dashed divide-line-strong">
        {cart.items.map((line) => (
          <li key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 py-4">
            <div>
              <p className="font-bold">{line.name}</p>
              {line.options.length > 0 && (
                <p className="text-sm text-ink-muted">{line.options.map((o) => o.name).join(", ")}</p>
              )}
              {line.specialInstructions && (
                <p className="text-sm text-ink-muted">Note: {line.specialInstructions}</p>
              )}
              {line.problems.map((p) => (
                <p key={p} className="mt-1 text-sm font-bold text-danger-700">
                  {itemProblemText(p)}
                </p>
              ))}
            </div>
            <p className="text-right font-bold">{formatCents(line.lineTotalCents)}</p>
            <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="inline-flex items-center gap-2">
                <span className="text-sm text-ink-muted">Quantity</span>
                <select
                  value={line.quantity}
                  disabled={busyLine === line.id}
                  aria-label={`Quantity of ${line.name}`}
                  onChange={(e) =>
                    void change(
                      line.id,
                      requestJson(`/api/v1/cart/items/${line.id}`, {
                        method: "PATCH",
                        body: { quantity: Number(e.target.value) },
                      }),
                    )
                  }
                  className="rounded-control border border-line-strong bg-canvas px-2.5 py-1.5"
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-sm text-ink-muted">
                {formatCents(line.unitPriceCents + line.optionsTotalCents)} each
              </span>
              <Button
                variant="quiet"
                className="min-h-0 text-sm"
                disabled={busyLine === line.id}
                aria-label={`Remove ${line.name}`}
                onClick={() =>
                  void change(line.id, requestJson(`/api/v1/cart/items/${line.id}`, { method: "DELETE" }))
                }
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
