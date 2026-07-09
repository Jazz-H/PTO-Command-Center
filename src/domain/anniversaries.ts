/* Service-anniversary & tier-milestone calculations. Reads app state. */
import { state } from "../state/store.ts";
import { parseDate, today, isoDate, daysBetween } from "./dates.ts";

export function anniversaryFor(years: number): Date { const h = parseDate(state.config.hire); return new Date(h.getFullYear()+years, h.getMonth(), h.getDate()); }
export function yearsOfService(asOf?: Date): number { asOf = asOf || today(); const h = parseDate(state.config.hire); return (asOf.getTime() - h.getTime()) / (365.25 * 86400000); }
export function nextMilestone(asOf?: Date){
  asOf = asOf || today(); const yos = yearsOfService(asOf);
  const upcoming = state.tiers.filter(t => t.years > yos);
  if (!upcoming.length) return null;
  const next = upcoming[0];
  return {...next, date: anniversaryFor(next.years), daysUntil: daysBetween(asOf, anniversaryFor(next.years))};
}
export function currentMilestone(asOf?: Date){ asOf = asOf || today(); const yos = yearsOfService(asOf); const past = state.tiers.filter(t => t.years <= yos); return past.length ? past[past.length-1] : null; }
export function anniversaryDates(){ return new Set(state.tiers.map(t => isoDate(anniversaryFor(t.years)))); }
