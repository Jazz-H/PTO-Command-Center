import { describe, it, expect, afterEach, vi } from "vitest";
import { parseDate, isoDate, isWeekend, addDays, daysBetween, weekNum, ordSuffix, fmt, today } from "./dates.ts";

describe("dates", () => {
  afterEach(() => vi.useRealTimers());

  it("parseDate builds a local date (month is 0-indexed internally)", () => {
    const d = parseDate("2026-07-04")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);   // July
    expect(d.getDate()).toBe(4);
  });

  it("parseDate returns null for empty input", () => {
    expect(parseDate("")).toBeNull();
  });

  it("isoDate round-trips with parseDate", () => {
    expect(isoDate(parseDate("2026-11-26")!)).toBe("2026-11-26");
    expect(isoDate(new Date(2026, 0, 1))).toBe("2026-01-01"); // zero-padding
  });

  it("isWeekend flags Sat/Sun only", () => {
    expect(isWeekend(parseDate("2026-07-04")!)).toBe(true);  // Saturday
    expect(isWeekend(parseDate("2026-07-05")!)).toBe(true);  // Sunday
    expect(isWeekend(parseDate("2026-07-06")!)).toBe(false); // Monday
  });

  it("addDays crosses month boundaries", () => {
    expect(isoDate(addDays(parseDate("2026-07-30")!, 3))).toBe("2026-08-02");
    expect(isoDate(addDays(parseDate("2026-01-01")!, -1))).toBe("2025-12-31");
  });

  it("daysBetween counts whole days", () => {
    expect(daysBetween(parseDate("2026-07-04")!, parseDate("2026-07-11")!)).toBe(7);
    expect(daysBetween(parseDate("2026-07-11")!, parseDate("2026-07-04")!)).toBe(-7);
    expect(daysBetween(parseDate("2026-07-04")!, parseDate("2026-07-04")!)).toBe(0);
  });

  it("weekNum returns an ISO-ish week in range", () => {
    expect(weekNum(parseDate("2026-01-01")!)).toBeGreaterThanOrEqual(1);
    expect(weekNum(parseDate("2026-12-31")!)).toBeLessThanOrEqual(54);
  });

  it("ordSuffix handles the tricky teens and tens", () => {
    expect(ordSuffix(1)).toBe("st");
    expect(ordSuffix(2)).toBe("nd");
    expect(ordSuffix(3)).toBe("rd");
    expect(ordSuffix(4)).toBe("th");
    expect(ordSuffix(11)).toBe("th");
    expect(ordSuffix(12)).toBe("th");
    expect(ordSuffix(13)).toBe("th");
    expect(ordSuffix(21)).toBe("st");
    expect(ordSuffix(22)).toBe("nd");
    expect(ordSuffix(23)).toBe("rd");
  });

  it("fmt renders a readable US date", () => {
    const s = fmt(parseDate("2026-07-04")!, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    expect(s).toContain("July");
    expect(s).toContain("4");
    expect(s).toContain("2026");
    expect(s).toContain("Saturday");
  });

  it("today() is midnight of the current day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 9, 15, 30, 0));
    const t = today();
    expect(t.getHours()).toBe(0);
    expect(t.getMinutes()).toBe(0);
    expect(isoDate(t)).toBe("2026-07-09");
  });
});
