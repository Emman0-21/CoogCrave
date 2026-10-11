import { describe, expect, it } from "vitest";

import { formatCents, formatDateTime, formatMinute, formatNextOpen, formatTime } from "@/shared/format";

const CHICAGO = "America/Chicago";

describe("display formatting", () => {
  it("formats integer cents as dollars", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(2934)).toBe("$29.34");
    expect(formatCents(123456)).toBe("$1,234.56");
  });

  it("formats minutes after midnight, wrapping past-midnight values", () => {
    expect(formatMinute(0)).toBe("Midnight");
    expect(formatMinute(720)).toBe("Noon");
    expect(formatMinute(630)).toBe("10:30 AM");
    expect(formatMinute(1259)).toBe("8:59 PM");
    expect(formatMinute(1440)).toBe("Midnight");
    expect(formatMinute(1530)).toBe("1:30 AM");
  });

  it("describes the next opening relative to today, in campus time whatever the device's zone", () => {
    // Wednesday 2026-10-14, 8:00 AM in Chicago (13:00 UTC).
    const now = new Date("2026-10-14T13:00:00Z");
    expect(formatNextOpen("2026-10-14T15:30:00Z", now, CHICAGO)).toBe("Opens today at 10:30 AM");
    expect(formatNextOpen("2026-10-15T12:00:00Z", now, CHICAGO)).toBe("Opens tomorrow at 7:00 AM");
    expect(formatNextOpen("2026-10-17T16:00:00Z", now, CHICAGO)).toBe("Opens Saturday at 11:00 AM");
    // 11:30 PM Chicago is already "tomorrow" in UTC; the campus calendar decides.
    expect(formatNextOpen("2026-10-15T04:30:00Z", now, CHICAGO)).toBe("Opens today at 11:30 PM");
  });

  it("formats instants as campus wall-clock time", () => {
    expect(formatTime("2026-10-14T19:05:00Z", CHICAGO)).toBe("2:05 PM");
    expect(formatDateTime("2026-12-01T19:05:00Z", CHICAGO)).toBe("Dec 1, 1:05 PM");
  });
});
