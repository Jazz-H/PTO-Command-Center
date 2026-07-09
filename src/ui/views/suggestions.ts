/* Smart Suggestions view — the opportunity table, category filter chips, and
   summary KPIs. Reads the suggestion engine + balance domain; writes to its own
   DOM containers. Inline handlers (toggleSugFilter, bookSuggestion,
   viewInCalendar) resolve through the window bridge. */
import { state, save } from "../../state/store.ts";
import { today, isoDate, fmt } from "../../domain/dates.ts";
import { getAllotment, ytdUsage } from "../../domain/balance.ts";
import { buildAllSuggestions } from "../../domain/suggestions.ts";
import { miniKpi, esc } from "../dom.ts";
import { ICO } from "../icons.ts";

// Category render metadata (label, swatch color, icon, sort order).
const SUG_CATS = {
  company:  {label:"Company holidays",     chip:"v", color:"violet",  icon:ICO.gift,      order:1},
  federal:  {label:"Federal long weekends",chip:"c", color:"cyan",    icon:ICO.calendar,  order:2},
  weekend:  {label:"Long weekends",        chip:"a", color:"warn",    icon:ICO.star,      order:3},
  personal: {label:"Personal",             chip:"p", color:"pink",    icon:ICO.celebrate, order:4},
  balance:  {label:"Balance plan",         chip:"g", color:"success", icon:ICO.used,      order:5}
};

export function toggleSugFilter(cat){ state.sugFilters = state.sugFilters || {}; state.sugFilters[cat] = state.sugFilters[cat] === false ? true : false; save(); renderSuggestions(); }

function renderSugSummary(all){
  const kp = document.getElementById("sugKpis"); if (!kp) return;
  const cfg = state.config, y = cfg.year;
  const eds = new Set(state.entries.map(e => e.date));
  const isBooked = s => s.takeOn && s.takeOn.length && s.takeOn.every(d => eds.has(isoDate(d)));
  // Counts reflect what's still OPEN (un-booked), so they drop live as you book.
  const openIdeas = all.filter(s => s.bookable && !isBooked(s));
  const longWk = all.filter(s => s.roi >= 4 && !isBooked(s)).length;
  // Aggregate payoff of booking every open idea — not something you can read off one table row.
  const daysOff = openIdeas.reduce((s2,x) => s2 + (x.roi || 0), 0);
  const ptoCostDays = openIdeas.reduce((s2,x) => s2 + (x.hours || 0), 0) / cfg.workday;
  // PTO still available to spend this year (unbooked allotment) — matches the rest of the app.
  const deployHrs = Math.max(0, (getAllotment(y).vacation || 0) - ytdUsage("PTO", y));
  const deployDays = deployHrs / cfg.workday;
  kp.innerHTML =
    miniKpi("green", ICO.award, "Days Off Possible", `${daysOff}`, "v-green", `From ${ptoCostDays.toFixed(1)} PTO day${ptoCostDays===1?"":"s"}`) +
    miniKpi("purple", ICO.bulb, "Ideas to Book", `${openIdeas.length}`, "v-purple", "Still open this year") +
    miniKpi("cyan", ICO.star, "Long Weekends", `${longWk}`, "v-cyan", "4-day+ breaks open") +
    miniKpi("amber", ICO.palm, "PTO to Deploy", `${deployHrs.toFixed(0)}<span class="unit">hrs</span>`, "v-amber", `${deployDays.toFixed(1)} days unbooked`);
}

export function dismissSugTip(){ state.sugTipDismissed = true; save(); const el = document.getElementById("sugTip"); if (el) el.style.display = "none"; }

export function renderSuggestions(){
  const tipEl = document.getElementById("sugTip"); if (tipEl) tipEl.style.display = state.sugTipDismissed ? "none" : "";
  const all = buildAllSuggestions(state.config.year);
  const eds = new Set(state.entries.map(e => e.date));
  const filters = state.sugFilters || {};
  const t0 = today();
  const sortDate = s => (s.takeOn && s.takeOn.length ? s.takeOn[0] : (s.date || null));
  const isUpcoming = s => { const d = sortDate(s); return d ? d >= t0 : true; };
  const upcoming = all.filter(isUpcoming);
  renderSugSummary(upcoming);
  const present = [...new Set(upcoming.map(s => s.category))].sort((a,b) => SUG_CATS[a].order - SUG_CATS[b].order);
  // Filter chips (counts reflect what's upcoming)
  const chipsEl = document.getElementById("sugFilters");
  if (chipsEl){
    chipsEl.innerHTML = present.map(c => { const m = SUG_CATS[c]; const off = filters[c] === false; const n = upcoming.filter(s => s.category === c).length;
      return `<button class="legend-item${off?' off':''}" onclick="toggleSugFilter('${c}')"><span class="legend-swatch" style="background:var(--${m.color})"></span><span>${m.label} (${n})</span></button>`; }).join("");
  }
  const tb = document.querySelector("#sugTable tbody");
  if (!upcoming.length){ tb.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">${ICO.star}</div><h4>No upcoming opportunities</h4><p>You're past this year's holidays and long weekends — check back in January, or add holidays in Settings.</p></div></td></tr>`; return; }
  const items = upcoming.filter(s => filters[s.category] !== false)
    .sort((a,b) => { const da = sortDate(a), db = sortDate(b); if (da && db) return da - db; if (da) return -1; if (db) return 1; return 0; });
  if (!items.length){ tb.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">${ICO.star}</div><h4>All categories hidden</h4><p>Turn a category chip back on to see suggestions.</p></div></td></tr>`; return; }
  tb.innerHTML = items.map(s => {
    const m = SUG_CATS[s.category];
    const takeStr = s.takeOn.length ? s.takeOn.map(d => fmt(d,{weekday:"short",month:"short",day:"numeric"})).join(", ") : "—";
    const roiB = s.roi >= 5 ? `<span class="chip star">★ ${s.roi}d</span>` : `<span class="chip v">${s.roi}-day</span>`;
    const when = s.date ? `${fmt(s.date,{month:"short",day:"numeric"})} <span style="color:var(--n-400)">${s.dayName.slice(0,3)}</span>` : "—";
    const why = `<span class="sug-why" title="${esc(s.reason)}">${ICO.info}</span>`;
    const catDot = `<span class="sug-cat-dot" style="background:var(--${m.color})" title="${m.label}"></span>`;
    const catLabel = `<span class="sug-cat-label">${m.label}</span>`;
    let action = "";
    if (s.bookable){
      const bookedAll = s.takeOn.length && s.takeOn.every(d => eds.has(isoDate(d)));
      action = bookedAll
        ? `<button class="btn subtle sm" onclick="viewInCalendar('${isoDate(s.takeOn[0])}')" title="View in calendar"><span class="chip g" style="margin:0">${ICO.check} Booked</span></button>`
        : `<button class="btn sm" onclick='bookSuggestion(${JSON.stringify(s.takeOn.map(isoDate))})'>Book</button>`;
    }
    return `<tr><td data-label="Occasion"><div class="sug-occ"><b>${catDot}${esc(s.occasion)}</b>${catLabel}</div></td><td data-label="When">${when}</td><td data-label="Take PTO on"><b>${takeStr}</b></td><td data-label="Outcome">${esc(s.result)} ${why}</td><td data-label="Hours" class="num">${s.hours}</td><td data-label="ROI">${roiB}</td><td class="cell-actions">${action}</td></tr>`;
  }).join("");
}
