import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seed, entry } from "../test/fixtures.ts";
import { state } from "../state/store.ts";
import { getPersonalHoliday, isEligibleForPH, personalHolidayDates, reconcilePersonalHolidays, detachPH } from "./personalholiday.ts";

describe("personalholiday", () => {
  beforeEach(() => seed());
  afterEach(() => vi.useRealTimers());

  it("getPersonalHoliday returns the year's record, lazily creating missing ones", () => {
    expect(getPersonalHoliday(2026).status).toBe("Unscheduled");
    const created = getPersonalHoliday(2030);
    expect(created).toMatchObject({ year: 2030, date: null, status: "Unscheduled" });
    expect(state.personalHolidays.some(p => p.year === 2030)).toBe(true);
  });

  it("isEligibleForPH turns true after 90 days of service", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 7, 15));      // ~2wk after 2025-07-28 hire
    expect(isEligibleForPH().eligible).toBe(false);
    vi.setSystemTime(new Date(2026, 0, 1));       // ~5mo later
    expect(isEligibleForPH().eligible).toBe(true);
  });

  it("reconcilePersonalHolidays syncs the record to a matching log entry", () => {
    seed({
      entries: [entry("2026-09-04", "Personal Holiday", 8, "Approved")],
      personalHolidays: [{ year: 2026, date: null, status: "Unscheduled", notes: "" }],
    });
    const changed = reconcilePersonalHolidays();
    expect(changed).toBe(true);
    const ph = getPersonalHoliday(2026);
    expect(ph.date).toBe("2026-09-04");
    expect(ph.status).toBe("Scheduled");
    expect(personalHolidayDates().has("2026-09-04")).toBe(true);
  });

  it("reconcile clears a scheduled record when its entry disappears", () => {
    seed({
      entries: [],
      personalHolidays: [{ year: 2026, date: "2026-09-04", status: "Scheduled", notes: "x" }],
    });
    expect(reconcilePersonalHolidays()).toBe(true);
    expect(getPersonalHoliday(2026).status).toBe("Unscheduled");
    expect(getPersonalHoliday(2026).date).toBeNull();
  });

  it("detachPH releases the record linked to a deleted PH entry", () => {
    seed({ personalHolidays: [{ year: 2026, date: "2026-09-04", status: "Scheduled", notes: "x" }] });
    detachPH({ date: "2026-09-04", type: "Personal Holiday", hours: 8 });
    const ph = state.personalHolidays.find(p => p.year === 2026)!;
    expect(ph.date).toBeNull();
    expect(ph.status).toBe("Unscheduled");
  });
});
