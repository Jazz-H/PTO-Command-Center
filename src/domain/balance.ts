/* PTO balance & usage calculations + holiday lookups. Reads app state. */
import { state } from "../state/store.ts";
import { isoDate, parseDate, today, daysBetween } from "./dates.ts";
import type { Allotment, EntryType } from "../state/schema.ts";

export function isHoliday(d: Date): boolean { return state.holidays.some(h => h.date === isoDate(d)); }
export function holidayName(d: Date): string | null { const h = state.holidays.find(h => h.date === isoDate(d)); return h ? h.name : null; }

export function getAllotment(year: number): Allotment { const a = state.allotments.find(a => a.year === year); return a || {year, vacation:0, sick:null}; }
// Cancelled entries never count toward usage/balance — the time off didn't happen.
export function ytdUsage(type: EntryType, year: number): number { return state.entries.filter(e => e.type===type && e.status!=="Cancelled" && parseDate(e.date).getFullYear()===year).reduce((s,e) => s+Number(e.hours||0), 0); }
export function currentBalance(asOf?: Date): number {
  asOf = asOf || today(); const y = asOf.getFullYear(); const allot = getAllotment(y);
  const used = state.entries.filter(e => e.type==="PTO" && e.status!=="Cancelled" && parseDate(e.date).getFullYear()===y && parseDate(e.date)<=asOf).reduce((s,e) => s+Number(e.hours||0), 0);
  return allot.vacation - used;
}
export function daysUntilNextRefill(): number { const t = today(); return daysBetween(t, new Date(t.getFullYear()+1, 0, 1)); }
