/* Friday Planner view — the WFH-Friday table (next ~2 months + "show more"),
   year-long KPI counts, and PTO-saved tally. Reads state + holiday domain;
   writes to its own DOM containers. Inline handlers (updateFri, toggleFriShowAll)
   resolve through the window bridge. */
import { state } from "../../state/store.ts";
import { today, addDays, isoDate, fmt, daysBetween, weekNum } from "../../domain/dates.ts";
import { holidayName } from "../../domain/balance.ts";
import { miniKpi } from "../dom.ts";
import { ICO } from "../icons.ts";

const FRI_DEFAULT_HRS = 4;
// Hours a booked Friday saves vs. taking PTO — per-Friday override, else the default.
function friHours(st){ const h = (st && st.hours != null && st.hours !== "") ? Number(st.hours) : NaN; return (h > 0) ? h : FRI_DEFAULT_HRS; }

export function renderFridays(){
  const t = today();
  const endOfYear = new Date(t.getFullYear(), 11, 31);
  let d = new Date(t);
  while (d.getDay() !== 5) d = addDays(d, 1);
  const fri = [];
  while (d <= endOfYear){ fri.push(new Date(d)); d = addDays(d, 7); }
  const sf = state.fridays || {};
  const tb = document.querySelector("#friTable tbody");
  const moreWrap = document.getElementById("friMoreWrap");
  if (!fri.length){ tb.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">${ICO.calendar}</div><h4>No more Fridays this year</h4><p>Come back after Jan 1 for the next year's schedule.</p></div></td></tr>`; if (moreWrap) moreWrap.innerHTML = ""; return; }
  // Only render the next ~2 months by default to keep the page short; the rest are behind "Show more".
  const cutoff = new Date(t.getFullYear(), t.getMonth() + 2, t.getDate());
  const showAll = state.friShowAll === true;
  const visible = showAll ? fri : fri.filter(f => f <= cutoff);
  const rows = visible.length ? visible : fri.slice(0, 1);
  const hiddenCount = fri.length - rows.length;
  let nBooked = 0, nHol = 0, nDone = 0, savedHrs = 0;
  fri.forEach(f => {                       // counts (and KPIs) always reflect the full year
    const st = sf[isoDate(f)] || {purpose:"", status:"Open"};
    if (holidayName(f)) nHol++;
    else if (st.status === "Scheduled"){ nBooked++; savedHrs += friHours(st); }
    else if (st.status === "Done"){ nDone++; savedHrs += friHours(st); }
  });
  tb.innerHTML = rows.map(f => {
    const iso = isoDate(f); const hol = holidayName(f);
    const st = sf[iso] || {purpose:"", status:"Open"};
    const isThisWeek = daysBetween(t, f) <= 6;
    return `<tr id="fri-${iso}"><td data-label="Friday"><b>${fmt(f,{month:"short",day:"numeric"})}</b> <span class="day" style="color:var(--n-500)">${fmt(f,{year:"numeric"})}</span>${isThisWeek?'<span class="chip r" style="margin-left:6px">This week</span>':''}</td><td data-label="Week" class="mono">W${weekNum(f)}</td><td data-label="Holiday?">${hol?`<span class="chip v">${hol}</span>`:'<span style="color:var(--n-400)">—</span>'}</td><td data-label="Purpose"><input type="text" value="${st.purpose.replace(/"/g,'&quot;')}" placeholder="e.g. Dentist" onchange="updateFri('${iso}','purpose',this.value)"/></td><td data-label="Hrs"><input type="number" min="0" step="0.5" style="width:62px" value="${st.hours!=null&&st.hours!==''?st.hours:''}" placeholder="${FRI_DEFAULT_HRS}" onchange="updateFri('${iso}','hours',this.value)" title="Hours this appointment saves vs. taking PTO"/></td><td data-label="Status"><select onchange="updateFri('${iso}','status',this.value)">${["Open","Scheduled","Done","Cancelled"].map(s=>`<option ${s===st.status?'selected':''}>${s}</option>`).join("")}</select></td></tr>`;
  }).join("");
  if (moreWrap){
    if (!showAll && hiddenCount > 0){
      moreWrap.innerHTML = `<button class="btn ghost" onclick="toggleFriShowAll()">${ICO.chevDown}<span>Show ${hiddenCount} more Friday${hiddenCount===1?"":"s"} through Dec 31</span></button>`;
    } else if (showAll && fri.length > visible.filter(f => f <= cutoff).length){
      moreWrap.innerHTML = `<button class="btn ghost" onclick="toggleFriShowAll()">${ICO.chevUp}<span>Show fewer</span></button>`;
    } else { moreWrap.innerHTML = ""; }
  }
  const metaEl = document.getElementById("friMeta"); if (metaEl) metaEl.textContent = showAll ? `${fri.length} Friday${fri.length===1?"":"s"} left` : `Showing ${rows.length} of ${fri.length}`;
  const usedFri = nBooked + nDone;
  const savedDisp = savedHrs % 1 === 0 ? String(savedHrs) : savedHrs.toFixed(1);
  const kp = document.getElementById("friKpis");
  if (kp) kp.innerHTML =
    miniKpi("cyan", ICO.calendar, "WFH Fridays Left", `${fri.length}`, "v-cyan", `Through Dec 31, ${t.getFullYear()}`) +
    miniKpi("purple", ICO.check, "Fridays Booked", `${nBooked}`, "v-purple", "Marked Scheduled") +
    miniKpi("magenta", ICO.gift, "Holiday Fridays", `${nHol}`, "v-magenta", "Paid days off — no PTO needed") +
    miniKpi("green", ICO.palm, "PTO Saved", `${savedDisp}<span class="unit">hrs</span>`, "v-green", `${usedFri} Friday${usedFri===1?"":"s"} used for errands`);
}
