import { cn } from "@/components/ui/cn";
import { formatMinute, formatNextOpen } from "@/shared/format";
import type { RestaurantSummary } from "@/shared/schemas/ordering";

type Status = Pick<
  RestaurantSummary,
  "isOpenNow" | "canOrder" | "closesAtMinute" | "nextOpenAt" | "isAcceptingOrders"
>;

/** "Open until 9:00 PM", "Not taking orders right now", or "Closed · Opens tomorrow at 7:00 AM". */
export function openStatusText(status: Status, now: Date, timeZone: string): string {
  if (status.canOrder) {
    // A range ending at midnight is reported as minute 0; "Open until Midnight" reads correctly.
    return status.closesAtMinute === null ? "Open now" : `Open until ${formatMinute(status.closesAtMinute)}`;
  }
  if (status.isOpenNow && !status.isAcceptingOrders) return "Not taking orders right now";
  return status.nextOpenAt ? `Closed. ${formatNextOpen(status.nextOpenAt, now, timeZone)}` : "Closed";
}

/** Open/closed shown with a shape as well as color: a filled dot for open, a hollow ring for closed. */
export function OpenStatus({
  status,
  now,
  timeZone,
  className,
}: {
  status: Status;
  now: Date;
  timeZone: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        status.canOrder ? "text-success-700" : "text-ink-muted",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          status.canOrder ? "bg-success-700" : "border-2 border-line-strong",
        )}
      />
      {openStatusText(status, now, timeZone)}
    </span>
  );
}
