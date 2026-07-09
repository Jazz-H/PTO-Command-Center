import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seed } from "../test/fixtures.ts";
import { parseDate, isoDate } from "./dates.ts";
import { anniversaryFor, yearsOfService, nextMilestone, currentMilestone, anniversaryDates } from "./anniversaries.ts";

describe("anniversaries", () => {
  beforeEach(() => seed());               // hire = 2025-07-28
  afterEach(() => vi.useRealTimers());

  it("anniversaryFor adds N years to the hire date", () => {
    expect(isoDate(anniversaryFor(1))).toBe("2026-07-28");
    expect(isoDate(anniversaryFor(5))).toBe("2030-07-28");
  });

  it("yearsOfService is ~1.0 at the first anniversary", () => {
    const yos = yearsOfService(parseDate("2026-07-28")!);
    expect(yos).toBeGreaterThanOrEqual(0.99);
    expect(yos).toBeLessThanOrEqual(1.01);
  });

  it("nextMilestone / currentMilestone bracket the tenure", () => {
    const asOf = parseDate("2026-08-01")!;   // just past 1yr
    expect(currentMilestone(asOf)!.years).toBe(1);
    const next = nextMilestone(asOf)!;
    expect(next.years).toBe(2);
    expect(isoDate(next.date)).toBe("2027-07-28");
    expect(next.daysUntil).toBeGreaterThan(0);
  });

  it("before the first anniversary there is no current milestone", () => {
    expect(currentMilestone(parseDate("2026-01-01")!)).toBeNull();
    expect(nextMilestone(parseDate("2026-01-01")!)!.years).toBe(1);
  });

  it("anniversaryDates returns one ISO date per tier", () => {
    const set = anniversaryDates();
    expect(set.has("2026-07-28")).toBe(true);   // 1yr
    expect(set.has("2027-07-28")).toBe(true);   // 2yr
    expect(set.size).toBe(3);
  });
});
