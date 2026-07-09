import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seed, entry } from "../test/fixtures.ts";
import { buildChartData, usageThisVsLast, vacCumulativeByMonth } from "./charts.ts";

describe("charts", () => {
  afterEach(() => vi.useRealTimers());

  it("vacCumulativeByMonth accumulates PTO hours month over month", () => {
    seed({ entries: [
      entry("2026-01-15", "PTO", 8),
      entry("2026-01-20", "PTO", 8),
      entry("2026-03-10", "PTO", 8),
      entry("2026-02-01", "Sick", 8),   // not PTO → ignored
    ]});
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 12, 0, 0));   // full year visible
    const cum = vacCumulativeByMonth(2026);
    expect(cum[0]).toBe(16);    // Jan: 8+8
    expect(cum[1]).toBe(16);    // Feb: no PTO added
    expect(cum[2]).toBe(24);    // Mar: +8
    expect(cum[cum.length - 1]).toBe(24);
  });

  it("usageThisVsLast diffs this month against last", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));   // June 2026
    seed({ entries: [
      entry("2026-06-05", "PTO", 8),
      entry("2026-06-06", "PTO", 8),
      entry("2026-05-10", "PTO", 8),
    ]});
    const r = usageThisVsLast();
    expect(r.cur).toBe(16);
    expect(r.last).toBe(8);
    expect(r.diff).toBe(8);
  });

  it("buildChartData returns a 15-month rolling series with expected fields", () => {
    seed({ entries: [entry("2026-07-10", "PTO", 8)] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));
    const pts = buildChartData();
    expect(pts).toHaveLength(15);
    for (const p of pts){
      expect(typeof p.balance).toBe("number");
      expect(typeof p.usedYTD).toBe("number");
      expect(typeof p.allotment).toBe("number");
      expect(p.shortLabel).toMatch(/^[A-Z][a-z]{2}$/);
    }
    // first point is the current month; balance = allotment(80) - usedYTD
    expect(pts[0].balance).toBe(pts[0].allotment - pts[0].usedYTD);
  });
});
