/* PTO balance & usage calculations + holiday lookups. Reads app state. */
import { state } from "../state/store.ts";
import { isoDate, parseDate, today, daysBetween } from "./dates.ts";

export function isHoliday(d){ return state.holidays.some(h => h.date === isoDate(d)); }
export function holidayName(d){ const h = state.holidays.find(h => h.date === isoDate(d)); return h ? h.name : null; }

export function getAllotment(year){ const a = state.allotments.find(a => a.year === year); return a || {vacation:0, sick:null}; }
export function ytdUsage(type, year){ return state.entries.filter(e => e.type===type && parseDate(e.date).getFullYear()===year).reduce((s,e) => s+Number(e.hours||0), 0); }
export function currentBalance(asOf){
  asOf = asOf || today(); const y = asOf.getFullYear(); const allot = getAllotment(y);
  const used = state.entries.filter(e => e.type==="PTO" && parseDate(e.date).getFullYear()===y && parseDate(e.date)<=asOf).reduce((s,e) => s+Number(e.hours||0), 0);
  return allot.vacation - used;
}
export function daysUntilNextRefill(){ const t = today(); return daysBetween(t, new Date(t.getFullYear()+1, 0, 1)); }
