import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seed } from "../test/fixtures.ts";
import { isoDate } from "./dates.ts";
import { nthWeekday, usFederalHolidays, buildSuggestions, buildAllSuggestions, suggestedDates } from "./suggestions.ts";

describe("suggestions", () => {
  beforeEach(() => { seed(); vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  it("nthWeekday finds the Nth (and last) weekday of a month", () => {
    // 3rd Monday of Jan 2026 = MLK Day = 2026-01-19
    expect(isoDate(nthWeekday(2026, 0, 1, 3))).toBe("2026-01-19");
    // 4th Thursday of Nov 2026 = Thanksgiving = 2026-11-26
    expect(isoDate(nthWeekday(2026, 10, 4, 4))).toBe("2026-11-26");
    // last Monday of May 2026 = Memorial Day = 2026-05-25
    expect(isoDate(nthWeekday(2026, 4, 1, -1))).toBe("2026-05-25");
  });

  it("usFederalHolidays returns the 11 federal holidays with correct known dates", () => {
    const h = usFederalHolidays(2026);
    expect(h).toHaveLength(11);
    const byName = Object.fromEntries(h.map(x => [x.name, isoDate(x.d)]));
    expect(byName["New Year's Day"]).toBe("2026-01-01");
    expect(byName["Independence Day"]).toBe("2026-07-04");
    expect(byName["Thanksgiving"]).toBe("2026-11-26");
    expect(byName["Christmas Day"]).toBe("2026-12-25");
  });

  it("buildSuggestions returns bookable ideas with sane shape", () => {
    const sug = buildSuggestions(2026);
    expect(Array.isArray(sug)).toBe(true);
    expect(sug.length).toBeGreaterThan(0);
    for (const s of sug){
      expect(Array.isArray(s.takeOn)).toBe(true);
      expect(typeof s.result).toBe("string");
      expect(s.roi).toBeGreaterThanOrEqual(0);
    }
  });

  it("suggestedDates is a set of ISO date strings derived from suggestions", () => {
    const set = suggestedDates();
    expect(set instanceof Set).toBe(true);
    for (const iso of set) expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("buildAllSuggestions is a superset covering multiple categories", () => {
    const all = buildAllSuggestions(2026);
    expect(all.length).toBeGreaterThanOrEqual(buildSuggestions(2026).length);
    const cats = new Set(all.map(s => s.category));
    expect(cats.size).toBeGreaterThan(1);
  });
});
