/**
 * Display formatting shared by server-rendered pages and client components. Money is integer cents
 * everywhere; it becomes text only here. Times are shown in the campus time zone, whatever the
 * viewer's device is set to, because "opens at 10:30" means 10:30 on campus.
 */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 2098 → "$20.98" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Minutes after midnight (values past 1440 wrap to the next day) → "9:30 PM", "Noon", "Midnight". */
export function formatMinute(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  if (m === 0) return "Midnight";
  if (m === 720) return "Noon";
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** "Opens today at 10:30 AM", "Opens tomorrow at 7:00 AM", "Opens Monday at 11:00 AM" (campus time). */
export function formatNextOpen(iso: string, now: Date, timeZone: string): string {
  const when = new Date(iso);
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    when,
  );
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (dayKey(when) === dayKey(now)) return `Opens today at ${time}`;
  if (dayKey(when) === dayKey(tomorrow)) return `Opens tomorrow at ${time}`;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(when);
  return `Opens ${weekday} at ${time}`;
}

/** An instant as campus wall-clock time: "Oct 14, 2:05 PM". */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** An instant as campus time of day: "2:05 PM". */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The campus time zone. One campus in the MVP; restaurant pages use the zone stored with the campus. */
export const CAMPUS_TIME_ZONE = "America/Chicago";
