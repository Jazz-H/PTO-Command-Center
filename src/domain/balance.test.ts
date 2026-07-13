import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seed, entry } from "../test/fixtures.ts";
import { parseDate } from "./dates.ts";
import { isHoliday, holidayName, getAllotment, ytdUsage, currentBalance, daysUntilNextRefill } from "./balance.ts";

describe("balance", () => {
  beforeEach(() => seed());
  afterEach(() => vi.useRealTimers());

  it("isHoliday / holidayName match seeded company holidays", () => {
    expect(isHoliday(parseDate("2026-11-26")!)).toBe(true);
    expect(holidayName(parseDate("2026-11-26")!)).toBe("Thanksgiving Day");
    expect(isHoliday(parseDate("2026-11-25")!)).toBe(false);
    expect(holidayName(parseDate("2026-11-25")!)).toBeNull();
  });

  it("getAllotment returns the year's row, or a zero fallback", () => {
    expect(getAllotment(2026).vacation).toBe(80);
    expect(getAllotment(2026).sick).toBe(40);
    const missing = getAllotment(2099);
    expect(missing).toEqual({ year: 2099, vacation: 0, sick: null });
  });

  it("ytdUsage sums hours by type within a year", () => {
    seed({ entries: [
      entry("2026-01-15", "PTO", 8),
      entry("2026-02-10", "PTO", 4),
      entry("2026-03-01", "Sick", 8),
      entry("2025-12-31", "PTO", 8),   // different year — excluded
    ]});
    expect(ytdUsage("PTO", 2026)).toBe(12);
    expect(ytdUsage("Sick", 2026)).toBe(8);
    expect(ytdUsage("PTO", 2025)).toBe(8);
    expect(ytdUsage("PTO", 2099)).toBe(0);
  });

  it("currentBalance subtracts PTO used up to the as-of date", () => {
    seed({ entries: [
      entry("2026-01-15", "PTO", 8),
      entry("2026-06-01", "PTO", 16),
      entry("2026-12-20", "PTO", 8),   // after as-of → not counted
    ]});
    // allotment 2026 = 80; used through July = 24 → balance 56
    expect(currentBalance(parseDate("2026-07-01")!)).toBe(56);
    // end of year: all 32 counted → 48
    expect(currentBalance(parseDate("2026-12-31")!)).toBe(48);
  });

  it("excludes Cancelled entries from usage and balance", () => {
    seed({ entries: [
      entry("2026-01-15", "PTO", 8, "Scheduled"),
      entry("2026-02-10", "PTO", 8, "Cancelled"),   // cancelled → didn't happen
      entry("2026-03-01", "Sick", 8, "Cancelled"),
    ]});
    expect(ytdUsage("PTO", 2026)).toBe(8);
    expect(ytdUsage("Sick", 2026)).toBe(0);
    expect(currentBalance(parseDate("2026-12-31")!)).toBe(72);  // 80 − 8, cancelled ignored
  });

  it("Work Event entries don't count against PTO or sick balances", () => {
    seed({ entries: [
      entry("2026-02-01", "PTO", 8, "Scheduled"),
      entry("2026-03-15", "Work Event", 8, "Scheduled"),   // conference/offsite — not time off
      entry("2026-04-10", "Work Event", 8, "Scheduled"),
    ]});
    expect(ytdUsage("PTO", 2026)).toBe(8);
    expect(ytdUsage("Work Event", 2026)).toBe(16);          // tracked separately
    expect(currentBalance(parseDate("2026-12-31")!)).toBe(72);  // 80 − 8 PTO; Work Events ignored
  });

  it("daysUntilNextRefill counts to next Jan 1", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 25, 12, 0, 0)); // Dec 25 2026
    expect(daysUntilNextRefill()).toBe(7);              // → Jan 1 2027
  });
});
