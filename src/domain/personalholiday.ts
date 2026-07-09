/* Personal-holiday domain: the once-a-year CCCI personal holiday — its record,
   eligibility (90 days of service), and reconciliation with log entries.
   Pure domain: reads/mutates state, persists via save(). No DOM. */
import { state, save } from "../state/store.ts";
import { parseDate, today, addDays, daysBetween } from "./dates.ts";

// Get (or lazily create) the personal-holiday record for a given year.
export function getPersonalHoliday(year){
  let ph = state.personalHolidays.find(p => p.year === year);
  if (!ph){ ph = {year, date:null, status:"Unscheduled", notes:""}; state.personalHolidays.push(ph); save(); }
  return ph;
}

export function isEligibleForPH(){ const hire = parseDate(state.config.hire); const days = daysBetween(hire, today()); return {eligible: days >= 90, hireDate:hire, daysServed:days, eligibleOn: addDays(hire, 90)}; }

export function personalHolidayDates(){ return new Set(state.personalHolidays.filter(p => p.date).map(p => p.date)); }

// When a "Personal Holiday" log entry is deleted, release the linked PH record.
export function detachPH(entry){
  if (entry && entry.type === "Personal Holiday"){
    const ph = state.personalHolidays.find(p => p.date === entry.date);
    if (ph){ ph.date = null; ph.status = "Unscheduled"; ph.notes = ""; }
  }
}

// Keep the Personal Holiday record in sync with any "Personal Holiday" log entry for that year,
// so scheduling one from the Time Off Log updates the dashboard card (and vice-versa).
export function reconcilePersonalHolidays(){
  getPersonalHoliday(state.config.year); // ensure current-year record exists
  let changed = false;
  (state.personalHolidays||[]).forEach(ph => {
    if (ph.status === "Forfeited") return;
    const ent = state.entries
      .filter(e => e.type === "Personal Holiday" && parseDate(e.date).getFullYear() === ph.year)
      .sort((a,b) => parseDate(a.date) - parseDate(b.date))[0];
    if (ent){
      const st = ent.status === "Taken" ? "Taken" : "Scheduled";
      if (ph.date !== ent.date || ph.status !== st){ ph.date = ent.date; ph.status = st; if (!ph.notes) ph.notes = ent.notes || "Personal holiday"; changed = true; }
    } else if (ph.status === "Scheduled" || ph.status === "Taken"){
      ph.date = null; ph.status = "Unscheduled"; ph.notes = ""; changed = true;
    }
  });
  return changed;
}
