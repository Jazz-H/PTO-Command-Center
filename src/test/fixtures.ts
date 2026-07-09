/* Shared test fixtures — seed a known AppState into the live store. */
import { setState } from "../state/store.ts";
import type { AppState, Entry } from "../state/schema.ts";

export function seed(overrides: Partial<AppState> = {}): AppState {
  const base: AppState = {
    config: { name: "Test User", hire: "2025-07-28", year: 2026, workday: 8, birthday: "" },
    allotments: [
      { year: 2025, vacation: 32, sick: null, notes: "partial" },
      { year: 2026, vacation: 80, sick: 40, notes: "" },
      { year: 2027, vacation: 120, sick: null, notes: "" },
    ],
    personalHolidays: [
      { year: 2026, date: null, status: "Unscheduled", notes: "" },
      { year: 2027, date: null, status: "Unscheduled", notes: "" },
    ],
    tiers: [
      { years: 1, vacDays: 10, label: "1 Year", notes: "" },
      { years: 2, vacDays: 15, label: "2 Years", notes: "" },
      { years: 5, vacDays: 20, label: "5 Years", notes: "" },
    ],
    holidays: [
      { date: "2026-07-03", name: "Independence Day" },
      { date: "2026-11-26", name: "Thanksgiving Day" },
      { date: "2026-12-25", name: "Christmas Day" },
    ],
    entries: [],
    fridays: {},
    calFilters: {},
  };
  const st = { ...base, ...overrides } as AppState;
  setState(st);
  return st;
}

export const entry = (date: string, type: string, hours = 8, status = "Approved"): Entry => ({ date, type, hours, status, notes: "" });
