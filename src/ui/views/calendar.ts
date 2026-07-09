/* Calendar view — month grid with entry/holiday/suggestion/anniversary/Friday
   overlays, drag-and-drop rescheduling, month/year pickers, a collapsible side
   panel (insights + events list), and month stats. Owns calCursor (the visible
   month) and the drag payload. External code moves the cursor via
   gotoCalendarMonth(). Reads state + several domains; mutations persist via
   save() and repaint through the refresh() seam. Inline handlers (dragStart,
   dropOnDay, calJumpDay, openEditModal, …) resolve through the window bridge. */
import { state, save } from "../../state/store.ts";
import { refresh } from "../refresh.ts";
import { today, isoDate, parseDate, fmt, isWeekend, DOWABBR, DAYNAMES, MONTHNAMES, ordSuffix } from "../../domain/dates.ts";
import { holidayName } from "../../domain/balance.ts";
import { suggestedDates } from "../../domain/suggestions.ts";
import { anniversaryDates, anniversaryFor } from "../../domain/anniversaries.ts";
import { personalHolidayDates, getPersonalHoliday } from "../../domain/personalholiday.ts";
import { toast, esc } from "../dom.ts";
import { ICO } from "../icons.ts";

let calCursor = new Date();
// Set the visible month to the month containing `d`. Callers that mutate the
// cursor from outside the view go through here (they then refresh/render).
export function gotoCalendarMonth(d){ calCursor = new Date(d.getFullYear(), d.getMonth(), 1); }

// Scheduled/done Friday appointments, keyed by ISO date — calendar overlay data.
function scheduledFridayAppts(){
  const out = {};
  const fs = state.fridays || {};
  Object.keys(fs).forEach(iso => {
    const item = fs[iso];
    if (item && item.purpose && (item.status === "Scheduled" || item.status === "Done")){
      out[iso] = item;
    }
  });
  return out;
}

export function renderCalendar(){
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  syncCalPickers(y, m);
  document.getElementById("calHead").innerHTML = DOWABBR.map(d => `<div class="cal-dow">${d}</div>`).join("");
  const first = new Date(y,m,1); const pad = first.getDay(); const dim = new Date(y,m+1,0).getDate();
  const cells = []; for (let i=0;i<pad;i++) cells.push(null); for (let d=1;d<=dim;d++) cells.push(new Date(y,m,d));
  const em = {}; state.entries.forEach(e => { em[e.date]=e; });
  const sug = suggestedDates(); const annivs = anniversaryDates(); const phDates = personalHolidayDates(); const friAppts = scheduledFridayAppts(); const t = today();
  const f = state.calFilters || {};
  document.getElementById("calBody").innerHTML = cells.map(d => {
    if (!d) return `<div class="cal-day empty"></div>`;
    const iso = isoDate(d); const c = ["cal-day"];
    if (isWeekend(d)) c.push("wknd");
    if (d.getDay()===5 && f.fri!==false) c.push("fri");
    const hn = holidayName(d);
    if (hn && f.hol!==false) c.push("hol");
    const e = em[iso];
    if (e && e.type==="PTO" && f.vac!==false) c.push("vac");
    if (e && e.type==="Sick" && f.sick!==false) c.push("sick");
    if (e && e.type==="Personal Holiday" && f.personal!==false) c.push("personal");
    if (!e && phDates.has(iso) && f.personal!==false) c.push("personal");
    if (!e && sug.has(iso) && f.sug!==false) c.push("sug");
    const isAnniv = annivs.has(iso);
    if (isAnniv && f.anniv!==false) c.push("anniv");
    if (d.getTime()===t.getTime()) c.push("today");

    // Build tag stack (multiple tags per day possible)
    const tags = [];
    if (isAnniv && f.anniv!==false){ const tier = state.tiers.find(tr => isoDate(anniversaryFor(tr.years))===iso); if (tier) tags.push(`<span class="cal-tag anniv">${tier.label}</span>`); }
    if (hn && f.hol!==false){ tags.push(`<span class="cal-tag hol" title="${hn}">${hn.length>14?hn.slice(0,13)+'…':hn}</span>`); }
    if (e){
      const eIdx = state.entries.indexOf(e);
      const drag = `draggable="true" ondragstart="dragStart(event,'entry',${eIdx})" title="Drag to reschedule"`;
      if (e.type==="PTO" && f.vac!==false) tags.push(`<span class="cal-tag vac" ${drag}>PTO · ${e.hours}h</span>`);
      else if (e.type==="Sick" && f.sick!==false) tags.push(`<span class="cal-tag sick" ${drag}>Sick · ${e.hours}h</span>`);
      else if (e.type==="Personal Holiday" && f.personal!==false) tags.push(`<span class="cal-tag personal" ${drag}>Personal Hol.</span>`);
      else if (!["PTO","Sick","Personal Holiday"].includes(e.type)) tags.push(`<span class="cal-tag other" ${drag}>${e.type} · ${e.hours}h</span>`);
    }
    if (!e && sug.has(iso) && f.sug!==false){ tags.push(`<span class="cal-tag sug" draggable="true" ondragstart="dragStart(event,'sug','${iso}')" title="Drag to a day to book PTO">💡 Try PTO</span>`); }
    // Friday appointment overlay
    if (friAppts[iso] && f.friAppt!==false){
      const appt = friAppts[iso];
      tags.push(`<span class="cal-tag fri-appt" draggable="true" ondragstart="dragStart(event,'fri','${iso}')" title="${esc(appt.purpose)} · drag to another Friday">${appt.purpose.length>14?esc(appt.purpose.slice(0,13))+'…':esc(appt.purpose)}</span>`);
    }

    return `<div class="${c.join(' ')}" data-iso="${iso}" ondragover="dragOver(event,'${iso}')" ondragleave="dragLeave(event)" ondrop="dropOnDay(event,'${iso}')"><div class="dnum">${d.getDate()}</div><div class="cal-tags">${tags.join('')}</div></div>`;
  }).join("");
  renderCalStats(y, m);
  renderCalSide(y, m);
  updateLegendUI();
}
function syncCalPickers(y, m){
  const mp = document.getElementById("calMonthPicker");
  if (mp){
    if (!mp.options.length) mp.innerHTML = MONTHNAMES.map((n,i) => `<option value="${i}">${n}</option>`).join("");
    mp.value = String(m);
  }
  const yp = document.getElementById("calYearPicker");
  if (yp){
    const years = new Set([y, today().getFullYear()]);
    (state.entries||[]).forEach(e => years.add(parseDate(e.date).getFullYear()));
    (state.allotments||[]).forEach(a => years.add(a.year));
    (state.holidays||[]).forEach(h => years.add(parseDate(h.date).getFullYear()));
    const arr = [...years]; const lo = Math.min(...arr) - 1, hi = Math.max(...arr) + 1;
    const opts = []; for (let yr = lo; yr <= hi; yr++) opts.push(yr);
    yp.innerHTML = opts.map(yr => `<option value="${yr}">${yr}</option>`).join("");
    yp.value = String(y);
  }
  const st = document.getElementById("calSideTitle"); if (st) st.textContent = `${MONTHNAMES[m]} ${y}`;
}
export function setCalMonth(m){ calCursor = new Date(calCursor.getFullYear(), Number(m), 1); renderCalendar(); }
export function setCalYear(y){ calCursor = new Date(Number(y), calCursor.getMonth(), 1); renderCalendar(); }
export function toggleCalList(){ state.calListCollapsed = !state.calListCollapsed; save(); applyCalListCollapsed(); }
function applyCalListCollapsed(){ const side = document.getElementById("calSide"); if (side) side.classList.toggle("collapsed", !!state.calListCollapsed); }
export function calJumpDay(iso){ if (state.calListCollapsed){ state.calListCollapsed = false; save(); applyCalListCollapsed(); } flashCalDay(iso); const cell = document.querySelector(`.cal-day[data-iso="${iso}"]`); if (cell) cell.scrollIntoView({block:"nearest", behavior:"smooth"}); }
function renderCalSide(y, m){
  applyCalListCollapsed();
  renderCalInsights(y, m);
  renderCalEvents(y, m);
}
function renderCalInsights(y, m){
  const el = document.getElementById("calInsights"); if (!el) return;
  const inMonth = d => d.getFullYear()===y && d.getMonth()===m;
  const f = state.calFilters || {};
  const ents = state.entries.filter(e => inMonth(parseDate(e.date)));
  const rows = [];
  // Opportunities (suggested long-weekend days) this month
  const sug = suggestedDates(); let sugCount = 0; sug.forEach(iso => { const d = parseDate(iso); if (inMonth(d) && !state.entries.some(e => e.date===iso)) sugCount++; });
  if (sugCount > 0 && f.sug!==false){
    rows.push({ic:ICO.star, cls:"", html:`<span><b>${sugCount}</b> long-weekend ${sugCount===1?"opportunity":"opportunities"} this month — drag <b>💡 Try PTO</b> onto a day to book.</span>`});
  }
  // Pending approvals this month
  const pend = ents.filter(e => (e.status||"")==="Pending").length;
  if (pend > 0) rows.push({ic:ICO.clock, cls:"", html:`<span><b>${pend}</b> ${pend===1?"entry":"entries"} still <b>Pending</b> approval.</span>`});
  // Anniversary this month
  const annivs = anniversaryDates();
  const monthAnniv = [...annivs].find(iso => inMonth(parseDate(iso)));
  if (monthAnniv){ const tier = state.tiers.find(tr => isoDate(anniversaryFor(tr.years))===monthAnniv); if (tier) rows.push({ic:ICO.award, cls:"", html:`<span><b>${tier.label}</b> work anniversary on <b>${fmt(parseDate(monthAnniv),{month:"short",day:"numeric"})}</b>.`}); }
  // Next upcoming event overall (if this month has none upcoming, still useful)
  if (!rows.length){
    rows.push({ic:ICO.info, cls:"tip", html:`<span>No opportunities or pending items this month. Use the picker above to plan ahead.</span>`});
  }
  el.innerHTML = rows.map(r => `<div class="cal-ins ${r.cls}"><span class="cal-ins-ic">${r.ic}</span>${r.html}</div>`).join("");
}
function renderCalEvents(y, m){
  const el = document.getElementById("calEvents"); if (!el) return;
  const inMonth = d => d.getFullYear()===y && d.getMonth()===m;
  const f = state.calFilters || {};
  const evs = [];
  // Time-off entries
  state.entries.forEach(e => { const d = parseDate(e.date); if (!inMonth(d)) return;
    let color = "var(--n-400)", title = `${e.type} · ${e.hours}h`;
    if (e.type==="PTO"){ if (f.vac===false) return; color = "var(--success)"; title = `PTO · ${e.hours}h`; }
    else if (e.type==="Sick"){ if (f.sick===false) return; color = "var(--accent)"; title = `Sick · ${e.hours}h`; }
    else if (e.type==="Personal Holiday"){ if (f.personal===false) return; color = "var(--pink)"; title = "Personal Holiday"; }
    evs.push({d, iso:isoDate(d), color, title, meta:(e.status||"") + (e.notes?` · ${e.notes}`:"")});
  });
  // Company holidays
  (state.holidays||[]).forEach(h => { const d = parseDate(h.date); if (!inMonth(d) || f.hol===false) return; evs.push({d, iso:h.date, color:"var(--violet)", title:h.name, meta:"Company holiday"}); });
  // Personal holiday (scheduled, no entry)
  state.personalHolidays.filter(p => p.date).forEach(p => { const d = parseDate(p.date); if (!inMonth(d) || f.personal===false) return; if (state.entries.some(e => e.date===p.date)) return; evs.push({d, iso:p.date, color:"var(--pink)", title:"Personal Holiday", meta:p.status||"Scheduled"}); });
  // Anniversaries
  anniversaryDates().forEach(iso => { const d = parseDate(iso); if (!inMonth(d) || f.anniv===false) return; const tier = state.tiers.find(tr => isoDate(anniversaryFor(tr.years))===iso); evs.push({d, iso, color:"var(--warn)", title:(tier?tier.label+" ":"")+"anniversary", meta:"Work milestone"}); });
  // Friday appointments
  const friAppts = scheduledFridayAppts();
  Object.keys(friAppts).forEach(iso => { const d = parseDate(iso); if (!inMonth(d) || f.friAppt===false) return; evs.push({d, iso, color:"var(--cyan)", title:friAppts[iso].purpose||"Friday appointment", meta:"Friday appt · "+(friAppts[iso].status||"Scheduled")}); });
  evs.sort((a,b) => a.d - b.d || a.title.localeCompare(b.title));
  const t = today();
  if (!evs.length){ el.innerHTML = `<div class="cal-events-empty">Nothing scheduled this month.</div>`; return; }
  el.innerHTML = evs.map(ev => {
    const isToday = ev.d.getTime()===t.getTime();
    return `<button type="button" class="cal-ev${isToday?" today":""}" onclick="calJumpDay('${ev.iso}')" title="${esc(ev.title)}"><span class="cal-ev-date"><span class="d">${ev.d.getDate()}<span class="ord">${ordSuffix(ev.d.getDate())}</span></span><span class="w">${DAYNAMES[ev.d.getDay()].slice(0,3)}</span></span><span class="cal-ev-dot" style="background:${ev.color}"></span><span class="cal-ev-body"><span class="cal-ev-title">${esc(ev.title)}</span>${ev.meta?`<span class="cal-ev-meta">${esc(ev.meta)}</span>`:""}</span></button>`;
  }).join("");
}
function renderCalStats(y, m){
  const el = document.getElementById("calStats"); if (!el) return;
  const inMonth = d => d.getFullYear()===y && d.getMonth()===m;
  const ents = state.entries.filter(e => inMonth(parseDate(e.date)));
  const daysOff = new Set(ents.map(e => e.date)).size;
  const hrs = ents.reduce((s,e) => s+Number(e.hours||0), 0);
  const hols = (state.holidays||[]).filter(h => inMonth(parseDate(h.date))).length;
  let fridays = 0; const dim = new Date(y,m+1,0).getDate();
  for (let d=1; d<=dim; d++){ if (new Date(y,m,d).getDay()===5) fridays++; }
  el.innerHTML =
    `<span class="cal-stat"><span class="dot" style="background:var(--data-green)"></span><b>${daysOff}</b> ${daysOff===1?'day':'days'} off</span>` +
    `<span class="cal-stat"><b>${hrs.toFixed(0)}</b> hrs booked</span>` +
    `<span class="cal-stat"><span class="dot" style="background:var(--data-purple)"></span><b>${hols}</b> ${hols===1?'holiday':'holidays'}</span>` +
    `<span class="cal-stat"><span class="dot" style="background:var(--data-cyan)"></span><b>${fridays}</b> WFH Fridays</span>`;
}
function flashCalDay(iso){ setTimeout(() => { const cell = document.querySelector(`.cal-day[data-iso="${iso}"]`); if (cell){ cell.classList.add('flash'); setTimeout(()=>cell.classList.remove('flash'), 1400); } }, 150); }

function updateLegendUI(){
  const f = state.calFilters || {};
  document.querySelectorAll("#calLegend .legend-item").forEach(btn => { btn.classList.toggle("off", f[btn.dataset.filter] === false); });
}
export function toggleLegendFilter(key){
  if (!state.calFilters) state.calFilters = {};
  state.calFilters[key] = state.calFilters[key] === false ? true : false;
  save(); renderCalendar();
}
export function navMonth(n){ calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()+n, 1); renderCalendar(); }
export function goToToday(){
  const t = today();
  calCursor = new Date(t.getFullYear(), t.getMonth(), 1);
  renderCalendar();
  toast(`Jumped to ${MONTHNAMES[t.getMonth()]} ${t.getFullYear()}`);
}

// --- Drag entries between days to reschedule ---
// Drag payload: {type:'entry'|'fri'|'sug', key}. entry.key=index, fri/sug.key=iso date.
let _drag = null;
export function dragStart(ev, type, key){
  _drag = {type, key};
  if (ev.dataTransfer){ ev.dataTransfer.effectAllowed = "move"; try{ ev.dataTransfer.setData("text/plain", type+":"+key); }catch(_){} }
  if (ev.target && ev.target.classList) ev.target.classList.add("dragging");
}
// Returns a reason string if `drag` can't be dropped on `iso`, else null (valid)
function dropBlockReasonFor(drag, iso){
  if (!drag) return "Nothing to drop";
  const d = parseDate(iso);
  if (drag.type === "entry"){
    const idx = drag.key; const e = state.entries[idx];
    if (!e) return "No entry";
    if (iso === e.date) return null; // dropped back on its own day — no-op
    if (isWeekend(d)) return "Can't reschedule onto a weekend";
    if (holidayName(d)) return `${holidayName(d)} is a company holiday`;
    if (state.entries.some((x,i) => i !== idx && x.date === iso)) return "That day already has an entry";
    return null;
  }
  if (drag.type === "fri"){
    if (iso === drag.key) return null; // same Friday — no-op
    if (d.getDay() !== 5) return "Friday appointments can only move to a Friday";
    const sf = state.fridays || {};
    if (sf[iso] && sf[iso].purpose) return "That Friday already has an appointment";
    return null;
  }
  if (drag.type === "sug"){
    if (isWeekend(d)) return "Can't book PTO on a weekend";
    if (holidayName(d)) return `${holidayName(d)} is a company holiday`;
    if (state.entries.some(x => x.date === iso)) return "That day already has an entry";
    return null;
  }
  return null;
}
export function dragOver(ev, iso){
  ev.preventDefault();
  const invalid = _drag && !!dropBlockReasonFor(_drag, iso);
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = invalid ? "none" : "move";
  const cell = ev.currentTarget;
  if (cell && !cell.classList.contains("empty")){
    cell.classList.remove("drop-target","drop-invalid");
    cell.classList.add(invalid ? "drop-invalid" : "drop-target");
  }
}
export function dragLeave(ev){ const cell = ev.currentTarget; if (cell) cell.classList.remove("drop-target","drop-invalid"); }
export function dropOnDay(ev, iso){
  ev.preventDefault();
  const cell = ev.currentTarget; if (cell) cell.classList.remove("drop-target","drop-invalid");
  let drag = _drag;
  if (!drag && ev.dataTransfer){ const s = ev.dataTransfer.getData("text/plain"); if (s){ const i = s.indexOf(":"); drag = {type:s.slice(0,i), key:s.slice(i+1)}; if (drag.type === "entry") drag.key = Number(drag.key); } }
  _drag = null;
  if (!drag) return;
  const reason = dropBlockReasonFor(drag, iso);
  if (reason){
    const noop = (drag.type === "entry" && state.entries[drag.key] && iso === state.entries[drag.key].date) || (drag.type === "fri" && iso === drag.key);
    if (!noop) toast(reason);
    renderCalendar(); return;
  }
  if (drag.type === "entry") rescheduleEntry(drag.key, iso);
  else if (drag.type === "fri") moveFridayAppt(drag.key, iso);
  else if (drag.type === "sug") bookSuggestionAt(iso);
}
function moveFridayAppt(oldIso, newIso){
  const sf = state.fridays || {}; const item = sf[oldIso];
  if (!item || oldIso === newIso){ renderCalendar(); return; }
  delete sf[oldIso]; sf[newIso] = item; state.fridays = sf;
  save(); refresh();
  toast(`Moved "${item.purpose}" → Fri ${fmt(parseDate(newIso),{month:"short",day:"numeric"})}`);
}
function bookSuggestionAt(iso){
  if (state.entries.some(e => e.date === iso)){ toast("That day already has an entry"); renderCalendar(); return; }
  state.entries.push({date:iso, type:"PTO", hours:state.config.workday, status:"Pending", notes:"From smart suggestion"});
  save(); refresh();
  toast(`Booked PTO → ${fmt(parseDate(iso),{weekday:"short",month:"short",day:"numeric"})}`);
}
function rescheduleEntry(idx, newDate){
  const e = state.entries[idx];
  if (!e || !newDate) return;
  const oldDate = e.date, oldType = e.type;
  if (oldDate === newDate){ renderCalendar(); return; }
  if (state.entries.some((x,i) => i !== idx && x.date === newDate)){ toast("That day already has an entry"); renderCalendar(); return; }
  e.date = newDate;
  // Keep the Personal Holiday tracker in sync (mirrors saveEditEntry)
  if (oldType === "Personal Holiday"){
    const phOld = state.personalHolidays.find(p => p.date === oldDate);
    if (phOld){ phOld.date = null; phOld.status = "Unscheduled"; phOld.notes = ""; }
    const phNew = getPersonalHoliday(parseDate(newDate).getFullYear());
    phNew.date = newDate; phNew.status = e.status === "Taken" ? "Taken" : "Scheduled";
  }
  save(); refresh();
  toast(`Moved ${oldType} → ${fmt(parseDate(newDate),{weekday:"short",month:"short",day:"numeric"})}`);
}
