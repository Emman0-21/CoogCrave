import { formatCents } from "@/shared/format";
import type { PriceView } from "@/shared/schemas/ordering";

/** Itemized totals (PRD ORD-1). Tax is a sample rate and is labeled as one. */
export function PriceBreakdown({ price, className }: { price: PriceView; className?: string }) {
  const rows: [string, number][] = [
    ["Subtotal", price.subtotalCents],
    ["Delivery fee", price.deliveryFeeCents],
    ["Service fee", price.serviceFeeCents],
    ["Tax (sample rate)", price.taxCents],
    ["Courier tip", price.tipCents],
  ];
  return (
    <dl className={className}>
      {rows.map(([label, cents]) => (
        <div key={label} className="flex justify-between gap-4 py-1">
          <dt className="text-ink-muted">{label}</dt>
          <dd>{formatCents(cents)}</dd>
        </div>
      ))}
      <div className="mt-2 flex justify-between gap-4 border-t border-line-strong pt-3 text-lg font-bold">
        <dt>Total</dt>
        <dd>{formatCents(price.totalCents)}</dd>
      </div>
    </dl>
  );
}
