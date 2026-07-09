import { DAYNAMES, DOWABBR, MONTHNAMES, parseDate, fmt, isoDate, today, isWeekend, addDays, daysBetween } from "./domain/dates.ts";
import { state, setState, save, DEFAULTS, ptoMigrate } from "./state/store.ts";
import { isHoliday, holidayName, getAllotment, ytdUsage, currentBalance, daysUntilNextRefill } from "./domain/balance.ts";
import { anniversaryFor, yearsOfService, nextMilestone, currentMilestone, anniversaryDates } from "./domain/anniversaries.ts";
import { buildSuggestions, suggestedDates, nthWeekday, usFederalHolidays, ptoOffSpan, buildAllSuggestions } from "./domain/suggestions.ts";
import { icsEscape, icsFold, csvCell, parseCSVText, parseHtmlTable, ingestEntryRows } from "./domain/importexport.ts";
import { getPersonalHoliday, isEligibleForPH, reconcilePersonalHolidays, detachPH } from "./domain/personalholiday.ts";
import { setRefresh } from "./ui/refresh.ts";
import { buildInsights, insightId, insightHtml, isNotifType, liveInsights, DASH_INSIGHT_MAX } from "./ui/insights.ts";
import { buildChartData, usageThisVsLast, vacCumulativeByMonth } from "./domain/charts.ts";
import { toast, cssVar, esc, ringSVG, ringSVG2, miniKpi, sparklineSVG } from "./ui/dom.ts";
import { renderAnniversaries, updateTier } from "./ui/views/anniversaries.ts";
import { renderFridays } from "./ui/views/fridays.ts";
import { renderSuggestions, toggleSugFilter, dismissSugTip } from "./ui/views/suggestions.ts";
import { renderLog, onLogCheck, toggleLogSelectAll, clearLogSelection, bulkStatusLog, bulkDeleteLog, setLogView, toggleMonthCollapse, onLogSearch, clearLogSearch, onLogFilter, clearLogFilters } from "./ui/views/log.ts";
import { renderCalendar, gotoCalendarMonth, navMonth, setCalMonth, setCalYear, toggleCalList, calJumpDay, toggleLegendFilter, goToToday, dragStart, dragOver, dragLeave, dropOnDay, flashCalDay } from "./ui/views/calendar.ts";
import { renderSettings, dismissCfgTip, updateAllot, toggleNA, saveConfig, addHoliday, delHoliday } from "./ui/views/settings.ts";
import { renderGreeting, renderKPIs, renderCharts, setChartRange, renderPersonalHolidayStrip, schedulePersonalHoliday, unschedulePersonalHoliday, markPersonalHolidayTaken, renderUpcoming, renderHistory, renderUpcomingFridays, resizeCharts } from "./ui/views/dashboard.ts";
import { setSwitchTab } from "./ui/nav.ts";
import { renderInsights, closeNotifPanel, closeUserMenu, toggleNotifPanel, dismissNotif, markAllNotifsRead, toggleUserMenu, openNotif, dismissInsight, restoreInsight, toggleShowDismissed, dismissAllInsights } from "./ui/notifications.ts";
import { ICO } from "./ui/icons.ts";

let editingIdx = -1;

function getThemeMode(){ return localStorage.getItem('pto_theme') || 'dark'; }
function resolveTheme(mode){ return mode==='system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode; }
function getTheme(){ return document.documentElement.getAttribute('data-theme') || 'light'; }
function setTheme(mode){ if(mode!=='system'&&mode!=='dark'&&mode!=='light') mode='system'; localStorage.setItem('pto_theme', mode); document.documentElement.setAttribute('data-theme', resolveTheme(mode)); updateThemeToggle(); renderCharts(); }
function updateThemeToggle(){ const cur = getThemeMode(); document.querySelectorAll('.theme-btn').forEach(b => { b.classList.toggle('active', b.dataset.setTheme === cur); }); }

// SIDEBAR TOGGLE
function openNav(){ document.documentElement.setAttribute('data-nav','open'); }
function closeNav(){ document.documentElement.removeAttribute('data-nav'); }
function toggleNav(){ document.documentElement.getAttribute('data-nav')==='open' ? closeNav() : openNav(); }
function toggleSidebarSmart(){ if (window.matchMedia('(max-width:860px)').matches) toggleNav(); else toggleSidebar(); }
function toggleSidebar(){
  const cur = document.documentElement.getAttribute('data-sidebar');
  const newState = cur === 'collapsed' ? '' : 'collapsed';
  if (newState) document.documentElement.setAttribute('data-sidebar', newState);
  else document.documentElement.removeAttribute('data-sidebar');
  localStorage.setItem('pto_sidebar', newState || 'expanded');
  updateSidebarToggleA11y();
  // Chart may need resize after transition
  setTimeout(() => resizeCharts(), 300);
}
function updateSidebarToggleA11y(){
  const btn = document.getElementById('sidebarCollapse'); if (!btn) return;
  const collapsed = document.documentElement.getAttribute('data-sidebar') === 'collapsed';
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  btn.title = (collapsed ? 'Expand' : 'Collapse') + ' sidebar (Ctrl/Cmd+B)';
}








function dashDrillLog(type){ state.logType = type||"All"; state.logYear = "All"; state.logSearch = ""; save(); switchTab("log"); renderLog(); }
function dashDrillLogYear(year){ state.logType = "All"; state.logYear = String(year); state.logSearch = ""; save(); switchTab("log"); renderLog(); }
function drillFriday(iso){ switchTab("fri"); setTimeout(() => { const row = document.getElementById("fri-"+iso); if (row){ row.scrollIntoView({block:"center"}); row.classList.add("row-flash"); setTimeout(()=>row.classList.remove("row-flash"), 1200); } }, 60); }






// ============ EDITABLE LOG — table/filters/bulk/chart live in ui/views/log.ts ============
function openEditModal(idx){
  editingIdx = idx;
  const e = state.entries[idx]; if (!e) return;
  dpSet("edit_date", e.date);
  document.getElementById("edit_type").value = e.type;
  document.getElementById("edit_hours").value = e.hours;
  document.getElementById("edit_status").value = e.status || "Approved";
  document.getElementById("edit_notes").value = e.notes || "";
  document.getElementById("editModal").classList.add("open");
}
function closeEditModal(){ document.getElementById("editModal").classList.remove("open"); editingIdx = -1; }
function saveEditEntry(){
  if (editingIdx < 0) return;
  const e = state.entries[editingIdx];
  const oldDate = e.date; const oldType = e.type;
  const newDate = document.getElementById("edit_date").value;
  const newType = document.getElementById("edit_type").value;
  if (!newDate){ toast("Date is required"); return; }
  e.date = newDate;
  e.type = newType;
  e.hours = Number(document.getElementById("edit_hours").value) || 8;
  e.status = document.getElementById("edit_status").value;
  e.notes = document.getElementById("edit_notes").value;
  // Sync personal holiday tracking if type/date changed
  if (oldType === "Personal Holiday" && (oldDate !== newDate || newType !== "Personal Holiday")){
    const ph = state.personalHolidays.find(p => p.date === oldDate);
    if (ph){ ph.date = null; ph.status = "Unscheduled"; ph.notes = ""; }
  }
  if (newType === "Personal Holiday"){
    const year = parseDate(newDate).getFullYear();
    const ph = getPersonalHoliday(year);
    ph.date = newDate; ph.status = e.status === "Taken" ? "Taken" : "Scheduled";
  }
  // Batch edit: offer to apply type/status/notes to the rest of the batch
  if (e.batchId){
    const siblings = state.entries.filter(x => x.batchId === e.batchId && x !== e);
    if (siblings.length && confirm(`Apply this entry's type, status, and notes to all ${siblings.length + 1} entries in its batch? (Dates and hours stay per-day.)`)){
      siblings.forEach(x => { x.type = e.type; x.status = e.status; x.notes = e.notes; });
    }
  }
  save(); closeEditModal(); refresh(); toast("Entry updated");
}





// ===== Custom date picker (PTO-503 step B) =====
let _dp = { field:null, cursor:null, focus:null };
function dpSet(fieldId, iso){
  const inp = document.getElementById(fieldId); if (!inp) return;
  inp.value = iso || "";
  const txt = document.getElementById(fieldId + "_text");
  if (txt){ const btn = txt.closest(".dp-field");
    if (iso){ txt.textContent = fmt(parseDate(iso),{weekday:"short",month:"short",day:"numeric",year:"numeric"}); if (btn) btn.classList.remove("placeholder"); }
    else { txt.textContent = "Pick a date"; if (btn) btn.classList.add("placeholder"); }
  }
}
function dpDisabled(fieldId, iso){
  if (fieldId === "e_end") return false;                                   // range end — any day
  if (fieldId === "e_date" && state.entryAllDay !== false) return false;    // all-day range start — any day
  const editingDate = (fieldId === "edit_date" && editingIdx >= 0 && state.entries[editingIdx]) ? state.entries[editingIdx].date : null;
  if (iso === editingDate) return false;                                   // the entry's own date is fine
  return state.entries.some(e => e.date === iso);                          // otherwise block already-booked days
}
function openDatePicker(fieldId, anchor){
  _dp.field = fieldId;
  const cur = document.getElementById(fieldId).value;
  const base = cur ? parseDate(cur) : today();
  _dp.cursor = new Date(base.getFullYear(), base.getMonth(), 1);
  _dp.focus = cur || isoDate(today());
  renderDatePicker();
  const pop = document.getElementById("datePicker");
  pop.classList.add("open");
  positionDatePicker(anchor);
}
function closeDatePicker(){ const p = document.getElementById("datePicker"); if (p) p.classList.remove("open"); _dp.field = null; }
function datePickerOpen(){ const p = document.getElementById("datePicker"); return !!(p && p.classList.contains("open")); }
function positionDatePicker(anchor){
  const pop = document.getElementById("datePicker"); const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth || 262, ph = pop.offsetHeight || 300;
  let left = r.left; let top = r.bottom + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = left + "px"; pop.style.top = top + "px";
}
function dpMonth(n){ _dp.cursor = new Date(_dp.cursor.getFullYear(), _dp.cursor.getMonth() + n, 1); renderDatePicker(); }
function dpToday(){ const t = today(); _dp.cursor = new Date(t.getFullYear(), t.getMonth(), 1); _dp.focus = isoDate(t); renderDatePicker(); }
function renderDatePicker(){
  const y = _dp.cursor.getFullYear(), m = _dp.cursor.getMonth();
  document.getElementById("dpTitle").textContent = `${MONTHNAMES[m]} ${y}`;
  document.getElementById("dpDow").innerHTML = DOWABBR.map(d => `<span>${d[0]}</span>`).join("");
  const pad = new Date(y,m,1).getDay(), dim = new Date(y,m+1,0).getDate();
  const sel = document.getElementById(_dp.field).value;
  let cells = "";
  for (let i=0;i<pad;i++) cells += `<button type="button" class="dp-day blank" tabindex="-1"></button>`;
  for (let d=1;d<=dim;d++){
    const date = new Date(y,m,d), iso = isoDate(date); const hn = holidayName(date);
    const cls = ["dp-day"];
    if (isWeekend(date)) cls.push("wknd");
    if (hn) cls.push("hol");
    if (state.entries.some(e => e.date === iso)) cls.push("ent");
    if (date.getTime() === today().getTime()) cls.push("today");
    if (iso === sel) cls.push("sel");
    if (iso === _dp.focus) cls.push("focus");
    const dis = dpDisabled(_dp.field, iso); if (dis) cls.push("disabled");
    cells += `<button type="button" class="${cls.join(' ')}" ${dis ? 'aria-disabled="true"' : `onclick="dpSelect('${iso}')"`} title="${hn ? esc(hn) : ''}" tabindex="-1">${d}</button>`;
  }
  document.getElementById("dpGrid").innerHTML = cells;
}
function dpSelect(iso){
  const field = _dp.field;
  dpSet(field, iso);
  closeDatePicker();
  if (field === "e_date" || field === "e_end") updateRangePreview();
}
document.addEventListener("keydown", e => {
  if (!datePickerOpen()) return;
  const move = days => { let f = parseDate(_dp.focus || isoDate(today())); f = addDays(f, days); _dp.focus = isoDate(f); _dp.cursor = new Date(f.getFullYear(), f.getMonth(), 1); renderDatePicker(); e.preventDefault(); };
  if (e.key === "ArrowLeft") move(-1);
  else if (e.key === "ArrowRight") move(1);
  else if (e.key === "ArrowUp") move(-7);
  else if (e.key === "ArrowDown") move(7);
  else if (e.key === "PageUp"){ dpMonth(-1); e.preventDefault(); }
  else if (e.key === "PageDown"){ dpMonth(1); e.preventDefault(); }
  else if (e.key === "Enter"){ if (_dp.focus && !dpDisabled(_dp.field, _dp.focus)) dpSelect(_dp.focus); e.preventDefault(); }
  else if (e.key === "Escape"){ closeDatePicker(); e.preventDefault(); }
});
window.addEventListener("scroll", () => { if (datePickerOpen()) closeDatePicker(); }, true);
window.addEventListener("resize", () => { if (datePickerOpen()) closeDatePicker(); });

function uid(){ return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function businessDaysInRange(startIso, endIso){
  const out = []; if (!startIso || !endIso) return out;
  let s = parseDate(startIso), e = parseDate(endIso);
  if (e < s){ const t = s; s = e; e = t; }
  const booked = new Set(state.entries.map(x => x.date));
  for (let d = new Date(s); d <= e; d = addDays(d, 1)){
    if (isWeekend(d)) continue;
    const iso = isoDate(d);
    if (holidayName(d) || booked.has(iso)) continue;
    out.push(iso);
  }
  return out;
}
function setAllDay(on){ state.entryAllDay = !!on; save(); updateEntryFormUI(); }
function updateEntryFormUI(){
  const allDay = state.entryAllDay !== false;
  const cb = document.getElementById("e_allday"); if (cb) cb.checked = allDay;
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? "" : "none"; };
  show("f_end", allDay);     // multi-day range only makes sense for all-day entries
  show("f_hours", !allDay);  // partial hours only when it's not an all-day entry
  const rp = document.getElementById("rangePreview"); if (rp) rp.style.display = allDay ? "" : "none";
  if (allDay) updateRangePreview();
}
function updateRangePreview(){
  if (state.entryAllDay === false) return;
  const rp = document.getElementById("rangePreview"); if (!rp) return;
  const s = document.getElementById("e_date").value, e = document.getElementById("e_end").value || s;
  if (!s){ rp.className = "range-preview"; rp.textContent = "Pick a start date. Add an end date to book a multi-day range — weekends, company holidays, and already-booked days are skipped."; return; }
  const days = businessDaysInRange(s, e); const wd = state.config.workday || 8;
  if (!days.length){ rp.className = "range-preview warn"; rp.textContent = "No business days to add in that range (all weekends, holidays, or already booked)."; return; }
  const span = days.length === 1 ? fmt(parseDate(days[0]),{month:"short",day:"numeric"}) : `${fmt(parseDate(days[0]),{month:"short",day:"numeric"})} – ${fmt(parseDate(days[days.length-1]),{month:"short",day:"numeric"})}`;
  rp.className = "range-preview";
  rp.innerHTML = `This will add <b>${days.length} ${days.length===1?"day":"days"}</b> (<b>${days.length*wd} hrs</b>) across ${span}. Weekends &amp; company holidays skipped.`;
}
function addEntry(){
  const allDay = state.entryAllDay !== false;
  const type = document.getElementById("e_type").value;
  const status = document.getElementById("e_status").value;
  const notes = document.getElementById("e_notes").value;
  const wd = state.config.workday || 8;
  const start = document.getElementById("e_date").value;
  if (!start){ toast("Pick a start date"); return; }
  if (allDay){
    const end = document.getElementById("e_end").value || start;
    const days = businessDaysInRange(start, end);
    if (!days.length){ toast("No business days to add in that range"); return; }
    if (days.length === 1){ state.entries.push({date:days[0], type, hours:wd, status, notes}); }
    else { const batchId = uid(); days.forEach(iso => state.entries.push({date:iso, type, hours:wd, status, notes, batchId})); }
    save(); document.getElementById("e_notes").value=""; dpSet("e_end",""); refresh(); toast(`Added ${days.length} ${days.length===1?"entry":"entries"}`);
    return;
  }
  const hours = Number(document.getElementById("e_hours").value) || wd;
  if (hours <= 0){ toast("Enter a number of hours"); return; }
  state.entries.push({date:start, type, hours, status, notes});
  save(); document.getElementById("e_notes").value=""; refresh(); toast("Entry added");
}
function deleteEntry(i){
  const entry = state.entries[i]; if (!entry) return;
  if (entry.batchId){
    const batch = state.entries.filter(e => e.batchId === entry.batchId);
    if (batch.length > 1 && confirm(`This entry is part of a batch of ${batch.length}. OK to delete all ${batch.length} in the batch — Cancel to delete just this one.`)){
      batch.forEach(detachPH);
      state.entries = state.entries.filter(e => e.batchId !== entry.batchId);
      save(); refresh(); toast(`Deleted ${batch.length} entries`); return;
    }
  }
  detachPH(entry);
  state.entries.splice(i, 1); save(); refresh(); toast("Entry removed");
}
function bookSuggestion(dates){
  let added = 0; const firstDate = parseDate(dates[0]);
  dates.forEach(d => { if (!state.entries.find(e => e.date === d)){ state.entries.push({date:d, type:"PTO", hours:state.config.workday, status:"Pending", notes:"From smart suggestion"}); added++; } });
  save(); gotoCalendarMonth(firstDate); refresh();
  toast(`Booked ${added} day${added===1?"":"s"} — ${fmt(firstDate,{weekday:"short",month:"short",day:"numeric",year:"numeric"})}`);
  switchTab("cal");
  dates.forEach(flashCalDay);
}
function switchTab(id){
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
  const btn = document.querySelector(`.nav-item[data-tab="${id}"]`);
  const panel = document.getElementById(id);
  if (btn) btn.classList.add("active");
  if (panel) panel.classList.add("active");
  const crumb = document.getElementById("crumb"); if (crumb) crumb.textContent = TAB_TITLES[id] || "";
  window.scrollTo(0,0);
}
setSwitchTab(switchTab); // register the tab-navigation seam for view modules
function globalSearchGo(v){ state.logSearch = v || ""; save(); switchTab("log"); renderLog(); const el = document.getElementById("logSearch"); if (el) el.value = v || ""; }
function requestTimeOff(){ switchTab("log"); const card = document.querySelector("#log .card.no-print"); if (card) card.scrollIntoView({behavior:"smooth", block:"center"}); const t = document.getElementById("e_type"); if (t) setTimeout(()=>t.focus(), 200); }
function viewInCalendar(iso){ gotoCalendarMonth(parseDate(iso)); renderCalendar(); switchTab("cal"); }
function updateFri(iso, field, val){ state.fridays = state.fridays||{}; state.fridays[iso] = state.fridays[iso]||{purpose:"",status:"Open"}; state.fridays[iso][field] = val; save(); renderCalendar(); renderUpcomingFridays(); renderFridays(); }
function toggleFriShowAll(){ state.friShowAll = !state.friShowAll; save(); renderFridays(); }
function exportData(){ const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `pto_backup_${isoDate(today())}.json`; a.click(); URL.revokeObjectURL(url); toast("Backup exported"); }
function exportICS(){
  const wd = state.config.workday || 8;
  const holEl = document.getElementById("ics_holidays");
  const includeHol = !!(holEl && holEl.checked);
  const stamp = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Jazz Harris//PTO Pilot//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:PTO Pilot"];
  let seq = 0;
  const add = (iso, summary, category, desc) => {
    const endIso = isoDate(addDays(parseDate(iso), 1)); // all-day DTEND is exclusive (next day)
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:pto-${iso}-${seq++}@pto-command-center`);
    lines.push("DTSTAMP:" + stamp);
    lines.push("DTSTART;VALUE=DATE:" + iso.replace(/-/g,""));
    lines.push("DTEND;VALUE=DATE:" + endIso.replace(/-/g,""));
    lines.push(icsFold("SUMMARY:" + icsEscape(summary)));
    if (category) lines.push("CATEGORIES:" + icsEscape(category));
    if (desc) lines.push(icsFold("DESCRIPTION:" + icsEscape(desc)));
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  };
  const emoji = t => t==="PTO" ? "🌴" : t==="Sick" ? "🤒" : t==="Personal Holiday" ? "🎁" : "📅";
  [...state.entries].sort((a,b) => a.date.localeCompare(b.date)).forEach(e => {
    const hoursNote = (e.hours && e.hours !== wd) ? ` (${e.hours}h)` : "";
    const summary = `${emoji(e.type)} ${e.type}${hoursNote}`;
    const desc = [e.status ? "Status: " + e.status : "", e.notes || ""].filter(Boolean).join(" — ");
    add(e.date, summary, e.type, desc);
  });
  if (includeHol){
    [...state.holidays].sort((a,b) => a.date.localeCompare(b.date)).forEach(h => add(h.date, `🏢 ${h.name}`, "Company Holiday", "CCCI company holiday"));
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], {type:"text/calendar;charset=utf-8"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `pto_calendar_${isoDate(today())}.ics`; a.click(); URL.revokeObjectURL(url);
  const n = state.entries.length + (includeHol ? state.holidays.length : 0);
  toast(`Exported ${n} event${n===1?"":"s"} to .ics`);
}
function exportCSV(){
  const rows = [["Date","Day","Type","Hours","Status","Notes"]];
  [...state.entries].sort((a,b) => a.date.localeCompare(b.date)).forEach(e => { const d = parseDate(e.date); rows.push([e.date, DAYNAMES[d.getDay()], e.type, e.hours, e.status||"", e.notes||""]); });
  const csv = rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], {type:"text/csv;charset=utf-8"}); // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `pto_entries_${isoDate(today())}.csv`; a.click(); URL.revokeObjectURL(url);
  toast(`Exported ${state.entries.length} row${state.entries.length===1?"":"s"} to CSV`);
}
// ── Excel (spreadsheet) export/import — no external libraries ──
// Export writes an HTML-table .xls that Excel/Sheets/Numbers open natively.
function exportExcel(){
  const head = ["Date","Day","Type","Hours","Status","Notes"];
  const rows = [...state.entries].sort((a,b) => a.date.localeCompare(b.date)).map(e => { const d = parseDate(e.date); return [e.date, DAYNAMES[d.getDay()], e.type, e.hours, e.status||"", e.notes||""]; });
  const th = head.map(h => `<th style="background:#2563EB;color:#fff;font-weight:bold;text-align:left;padding:5px 9px;border:1px solid #bbb">${esc(h)}</th>`).join("");
  const trs = rows.map(r => `<tr>${r.map(c => `<td style="padding:4px 9px;border:1px solid #ddd">${esc(c)}</td>`).join("")}</tr>`).join("");
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>PTO Entries</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>${"<thead><tr>"+th+"</tr></thead>"}<tbody>${trs}</tbody></table></body></html>`;
  const blob = new Blob(["﻿" + html], {type:"application/vnd.ms-excel"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `pto_entries_${isoDate(today())}.xls`; a.click(); URL.revokeObjectURL(url);
  toast(`Exported ${state.entries.length} row${state.entries.length===1?"":"s"} to Excel`);
}
let _xlsxLoad = null;
function loadXLSX(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxLoad) return _xlsxLoad;
  _xlsxLoad = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("no XLSX"));
    s.onerror = () => { _xlsxLoad = null; reject(new Error("load failed")); };
    document.head.appendChild(s);
  });
  return _xlsxLoad;
}
function finishSpreadsheetImport(rows){
  const res = ingestEntryRows(rows);
  if (!res || res.added === -1){ toast("Unrecognized format — the first row should have columns like Date, Type, Hours, Status, Notes"); return; }
  if (res.added === 0){
    const parts = [];
    if (res.dup) parts.push(`${res.dup} already in your log`);
    if (res.bad) parts.push(`${res.bad} with unreadable dates`);
    toast(parts.length ? `Nothing imported — ${parts.join(", ")}` : "No rows found to import");
    return;
  }
  save(); refresh();
  const extra = [];
  if (res.dup) extra.push(`${res.dup} dup`);
  if (res.bad) extra.push(`${res.bad} unreadable`);
  toast(`Imported ${res.added} entr${res.added===1?"y":"ies"}${extra.length?` · skipped ${extra.join(", ")}`:""}`);
}
function importSpreadsheet(ev){
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async e => {
    ev.target.value = "";
    const buf = e.target.result;
    const b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
    const isZip = b[0] === 0x50 && b[1] === 0x4B;   // "PK" → .xlsx (zip)
    const isOle = b[0] === 0xD0 && b[1] === 0xCF;   // OLE  → legacy binary .xls
    if (isZip || isOle){
      let XLSX;
      try { XLSX = await loadXLSX(); }
      catch(err){ toast("Couldn't load the Excel reader (offline?) — save the file as CSV and import that."); return; }
      try {
        const wb = XLSX.read(buf, {type:"array"});
        const ws = wb.Sheets[wb.SheetNames[0]];
        finishSpreadsheetImport(XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:""}));
      } catch(err){ toast("Couldn't read that Excel file"); }
      return;
    }
    // Plain text: CSV or our HTML-table .xls export
    const text = new TextDecoder("utf-8").decode(buf);
    let rows;
    try { rows = /<table/i.test(text) ? parseHtmlTable(text) : parseCSVText(text); }
    catch(err){ toast("Couldn't read that file"); return; }
    finishSpreadsheetImport(rows);
  };
  r.readAsArrayBuffer(f);
}
function importData(ev){ const f = ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = e => { try{ setState(JSON.parse(e.target.result)); ptoMigrate(state); if(!state.tiers) state.tiers = JSON.parse(JSON.stringify(DEFAULTS.tiers)); if(!state.personalHolidays) state.personalHolidays = JSON.parse(JSON.stringify(DEFAULTS.personalHolidays)); if(!state.calFilters) state.calFilters = {}; if(!state.fridays) state.fridays = {}; if(state.logSearch===undefined) state.logSearch=""; if(!state.logType) state.logType="All"; if(!state.logYear) state.logYear="All"; if(!state.logView) state.logView="list"; if(!state.collapsedMonths) state.collapsedMonths={}; if(!state.dismissedInsights) state.dismissedInsights=[]; if(state.showDismissed===undefined) state.showDismissed=false; if(!state.entryMode) state.entryMode="hours"; if(!state.sugFilters) state.sugFilters={}; if(state.config&&state.config.birthday===undefined) state.config.birthday=""; if(!state.chartRange) state.chartRange=12; if(!state.notificationsSeen) state.notificationsSeen=[]; save(); refresh(); toast("Backup imported"); }catch(err){ toast("Import failed"); } }; r.readAsText(f); }
function resetAll(){ if (!confirm("This will delete ALL your data. Continue?")) return; localStorage.removeItem("pto_state"); setState(JSON.parse(JSON.stringify(DEFAULTS))); save(); refresh(); toast("All data reset"); }

function refresh(){ renderGreeting(); renderKPIs(); renderPersonalHolidayStrip(); renderCharts(); renderInsights(); renderUpcoming(); renderHistory(); renderUpcomingFridays(); renderLog(); renderSuggestions(); renderFridays(); renderAnniversaries(); renderCalendar(); renderSettings(); updateRangePreview(); }
setRefresh(refresh); // register the re-render seam for view modules

const TAB_TITLES = {dash:"Dashboard", log:"Time Off Log", cal:"Calendar", sug:"Smart Suggestions", fri:"Friday Planner", ann:"Anniversaries", cfg:"Settings"};
document.querySelectorAll(".nav-item").forEach(t => { t.addEventListener("click", () => { switchTab(t.dataset.tab); closeNav(); }); });
document.querySelectorAll('.theme-btn').forEach(b => { b.addEventListener('click', () => setTheme(b.dataset.setTheme)); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getThemeMode()==='system'){ document.documentElement.setAttribute('data-theme', resolveTheme('system')); renderCharts(); } });
document.addEventListener('click', e => {
  const legendBtn = e.target.closest('#calLegend .legend-item');
  if (legendBtn) toggleLegendFilter(legendBtn.dataset.filter);
  // Close modal on backdrop click
  if (e.target.id === 'editModal') closeEditModal();
  // Close date picker when clicking outside it (and not on a picker field)
  if (datePickerOpen() && !e.target.closest('#datePicker') && !e.target.closest('.dp-field')) closeDatePicker();
  // Close notifications panel on outside click
  const np = document.getElementById('notifPanel');
  if (np && np.classList.contains('open') && !e.target.closest('.notif-wrap')) closeNotifPanel();
  // Close account menu on outside click
  const um = document.getElementById('userMenu');
  if (um && um.classList.contains('open') && !e.target.closest('.user-wrap')) closeUserMenu();
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'j'){ e.preventDefault(); setTheme(getTheme()==='dark' ? 'light' : 'dark'); }
  if (e.key === 'Escape' && !e.defaultPrevented && document.getElementById('editModal').classList.contains('open')) closeEditModal();
  if (e.key === 'Escape' && !e.defaultPrevented){ const np = document.getElementById('notifPanel'); if (np && np.classList.contains('open')) closeNotifPanel(); }
  if (e.key === 'Escape' && !e.defaultPrevented){ const um = document.getElementById('userMenu'); if (um && um.classList.contains('open')){ closeUserMenu(); const b = document.getElementById('userChipBtn'); if (b) b.focus(); } }
  if (e.key === 'Escape' && !e.defaultPrevented && document.documentElement.getAttribute('data-nav')==='open') closeNav();
  if ((e.ctrlKey || e.metaKey) && e.key === 'b'){ e.preventDefault(); toggleSidebar(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')){
    e.preventDefault(); const gs = document.getElementById('globalSearch'); if (gs){ gs.focus(); gs.select(); }
  }
  // "N" — quick Add Time Off (ignore when typing or with modifiers)
  if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey){
    const el = document.activeElement; const tag = el ? el.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !(el && el.isContentEditable)){ e.preventDefault(); requestTimeOff(); }
  }
});

dpSet("e_date", isoDate(today()));
gotoCalendarMonth(new Date(state.config.year, today().getMonth(), 1));
updateThemeToggle();
refresh();
updateEntryFormUI();
updateSidebarToggleA11y();
document.getElementById("printName").textContent = state.config.name || "";
document.getElementById("printDate").textContent = fmt(today(),{weekday:"long",month:"long",day:"numeric",year:"numeric"});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

// ===== Add to Home Screen / install prompt =====
let _deferredPrompt = null;
function pwaStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function pwaIsIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent || '') && !window.MSStream; }
function pwaDismissed(){ try{ return localStorage.getItem('pto_pwa_dismissed') === '1'; }catch(e){ return false; } }
function showPwaBanner(){ const el = document.getElementById('pwaBanner'); if (el) el.classList.add('show'); }
function hidePwaBanner(){ const el = document.getElementById('pwaBanner'); if (el) el.classList.remove('show'); }
function dismissPwaBanner(){ try{ localStorage.setItem('pto_pwa_dismissed','1'); }catch(e){} hidePwaBanner(); }
function installPwa(){
  if (!_deferredPrompt){ hidePwaBanner(); return; }
  _deferredPrompt.prompt();
  _deferredPrompt.userChoice.finally(() => { _deferredPrompt = null; hidePwaBanner(); });
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); _deferredPrompt = e;
  if (!pwaStandalone() && !pwaDismissed()) showPwaBanner();
});
window.addEventListener('appinstalled', () => { _deferredPrompt = null; hidePwaBanner(); try{ toast('Installed — find PTO on your home screen 🎉'); }catch(e){} });
// iOS Safari never fires beforeinstallprompt — show manual instructions instead
if (pwaIsIOS() && !pwaStandalone() && !pwaDismissed() && location.protocol.startsWith('http')){
  const t = document.getElementById('pwaTitle'), d = document.getElementById('pwaDesc'), ib = document.getElementById('pwaInstallBtn');
  if (t) t.textContent = 'Add PTO to your Home Screen';
  if (d) d.innerHTML = 'Tap the Share button, then “Add to Home Screen”.';
  if (ib) ib.style.display = 'none';
  setTimeout(showPwaBanner, 1600);
}


/* Inline-handler bridge — expose top-level functions on window so the existing
   on* attributes keep working after ES-module conversion. Retired once handlers
   move to event delegation (later phase). Generated from all top-level fn decls. */
if (typeof window !== "undefined") Object.assign(window, {
  getThemeMode, resolveTheme, getTheme, setTheme, updateThemeToggle, openNav, closeNav, toggleNav, toggleSidebarSmart, toggleSidebar, updateSidebarToggleA11y, toggleSugFilter, renderGreeting, renderKPIs, dashDrillLog, dashDrillLogYear, drillFriday, setChartRange, renderPersonalHolidayStrip, schedulePersonalHoliday, unschedulePersonalHoliday, markPersonalHolidayTaken, renderCharts, renderInsights, dismissNotif, toggleNotifPanel, closeNotifPanel, markAllNotifsRead, toggleUserMenu, closeUserMenu, openNotif, dismissInsight, restoreInsight, toggleShowDismissed, dismissAllInsights, renderUpcoming, renderHistory, renderUpcomingFridays, renderLog, onLogCheck, toggleLogSelectAll, clearLogSelection, bulkStatusLog, bulkDeleteLog, setLogView, toggleMonthCollapse, onLogSearch, clearLogSearch, onLogFilter, clearLogFilters, openEditModal, closeEditModal, saveEditEntry, dismissSugTip, renderSuggestions, renderFridays, renderAnniversaries, updateTier, renderCalendar, setCalMonth, setCalYear, toggleCalList, calJumpDay, toggleLegendFilter, goToToday, dragStart, dragOver, dragLeave, dropOnDay, dpSet, dpDisabled, openDatePicker, closeDatePicker, datePickerOpen, positionDatePicker, dpMonth, dpToday, renderDatePicker, dpSelect, dismissCfgTip, renderSettings, uid, businessDaysInRange, setAllDay, updateEntryFormUI, updateRangePreview, addEntry, deleteEntry, bookSuggestion, switchTab, globalSearchGo, requestTimeOff, viewInCalendar, navMonth, updateFri, toggleFriShowAll, updateAllot, toggleNA, saveConfig, addHoliday, delHoliday, exportData, exportICS, exportCSV, exportExcel, loadXLSX, finishSpreadsheetImport, importSpreadsheet, importData, resetAll, refresh, pwaStandalone, pwaIsIOS, pwaDismissed, showPwaBanner, hidePwaBanner, dismissPwaBanner, installPwa
});
