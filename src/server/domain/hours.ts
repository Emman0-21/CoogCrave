/**
 * Opening hours (PRD CAT-5). Hours are stored as weekly wall-clock ranges in the campus time zone:
 * dayOfWeek 0–6 (Sunday first) and minutes after that day's midnight. A closing minute above 1440 means
 * the range runs past midnight into the next day (open 18:00–01:30 is 1080–1530).
 *
 * Everything here works on wall-clock time in the given IANA zone, so daylight-saving changes are
 * handled by the Intl API rather than by hand.
 */

export interface HoursRange {
  dayOfWeek: number;
  opensAtMinute: number;
  closesAtMinute: number;
}

export interface OpenStatus {
  isOpen: boolean;
  /** When open: the wall-clock minute (0–1439) the current range closes. */
  closesAtMinute: number | null;
  /** When closed: the next opening within a week, or null if the restaurant has no hours. */
  nextOpenAt: Date | null;
}

const MINUTES_PER_DAY = 1440;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WallClock {
  year: number;
  month: number; // 1–12
  day: number;
  dayOfWeek: number; // 0 = Sunday
  minute: number; // 0–1439
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock date and time of an instant in a time zone. */
export function wallClock(instant: Date, timeZone: string): WallClock & { second: number } {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const dayOfWeek = WEEKDAYS.indexOf(parts.weekday ?? "");
  if (dayOfWeek < 0) throw new Error(`Unexpected weekday from Intl: ${parts.weekday}`);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    dayOfWeek,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of the zone from UTC at an instant, in minutes (Chicago: −300 in summer, −360 in winter). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, 0, w.minute, w.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The instant at which the zone's clocks show the given local date and minute. On the spring-forward
 * day a minute inside the skipped hour resolves to the same reading under the earlier offset (an hour
 * later in practice); restaurant hours don't start inside that hour, so this doesn't arise in practice.
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  minute: number,
  timeZone: string,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, 0, minute);
  const firstGuess = asUtc - offsetMinutes(new Date(asUtc), timeZone) * 60_000;
  const correctedOffset = offsetMinutes(new Date(firstGuess), timeZone);
  return new Date(asUtc - correctedOffset * 60_000);
}

function addDays(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dayOfWeek: d.getUTCDay(),
  };
}

/** Whether a set of weekly ranges is open at an instant, when it closes, and when it next opens. */
export function openStatus(hours: readonly HoursRange[], instant: Date, timeZone: string): OpenStatus {
  const now = wallClock(instant, timeZone);
  const yesterday = (now.dayOfWeek + 6) % 7;

  for (const range of hours) {
    if (
      range.dayOfWeek === now.dayOfWeek &&
      now.minute >= range.opensAtMinute &&
      now.minute < range.closesAtMinute
    ) {
      return { isOpen: true, closesAtMinute: range.closesAtMinute % MINUTES_PER_DAY, nextOpenAt: null };
    }
    const spill = range.closesAtMinute - MINUTES_PER_DAY;
    if (range.dayOfWeek === yesterday && spill > 0 && now.minute < spill) {
      return { isOpen: true, closesAtMinute: spill, nextOpenAt: null };
    }
  }

  // Closed: look at today (later openings) and the next seven days.
  for (let offset = 0; offset <= 7; offset++) {
    const date = addDays(now.year, now.month, now.day, offset);
    const openings = hours
      .filter((r) => r.dayOfWeek === date.dayOfWeek && (offset > 0 || r.opensAtMinute > now.minute))
      .map((r) => r.opensAtMinute)
      .sort((a, b) => a - b);
    const first = openings[0];
    if (first !== undefined) {
      return {
        isOpen: false,
        closesAtMinute: null,
        nextOpenAt: zonedTimeToInstant(date.year, date.month, date.day, first, timeZone),
      };
    }
  }
  return { isOpen: false, closesAtMinute: null, nextOpenAt: null };
}
