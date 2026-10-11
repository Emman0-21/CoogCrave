import { cn } from "@/components/ui/cn";
import type { OrderStatus } from "@/shared/enums";

import { ORDER_STATUS_LABEL, TONE_BY_STATUS } from "./labels";

const TONES = {
  open: "border-info-700 bg-info-50 text-info-700",
  done: "border-success-700 bg-success-50 text-success-700",
  stopped: "border-line-strong bg-surface text-ink-muted",
} as const;

/** An order's status as text in a bordered tag; the color only repeats what the words say. */
export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-ticket border px-2 py-0.5 text-sm leading-5 font-bold whitespace-nowrap",
        TONES[TONE_BY_STATUS[status]],
        className,
      )}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
