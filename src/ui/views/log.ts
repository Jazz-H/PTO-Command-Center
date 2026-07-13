/* Time Off Log view — the entries table (list / month-grouped), summary KPIs,
   monthly stacked-bar chart, search + type/year filters, and bulk actions.
   Reads state + balance domain; mutations persist via save() and repaint through
   the refresh() seam. The entry editor modal (openEditModal/saveEditEntry) stays
   in app.ts — it depends on the date-picker widget and is shared with the
   calendar. Inline handlers (onLogCheck, openEditModal, deleteEntry, …) resolve
   through the window bridge. */
import { state, save } from "../../state/store.ts";
import { refresh } from "../refresh.ts";
import { detachPH } from "../../domain/personalholiday.ts";
import { parseDate, fmt, today, DAYNAMES, MONTHNAMES } from "../../domain/dates.ts";
import { ytdUsage } from "../../domain/balance.ts";
import { toast, miniKpi, cssVar, $ } from "../dom.ts";
import { ICO } from "../icons.ts";

let logChart;
const selectedLog = new Set<number>();

function logIsFiltered(){
  return !!((state.logSearch||"").trim()) || (state.logType||"All")!=="All" || (state.logYear||"All")!=="All";
}
// Parse slash-commands out of the search box (e.g. "/vac /2026 /jul dentist")
function parseLogQuery(raw){
  const out: { type: string|null, year: string|null, month: number|null, text: string } = { type:null, year:null, month:null, text:"" };
  const words: string[] = [];
  (raw||"").split(/\s+/).forEach(tok => {
    if (!tok) return;
    if (tok[0] === "/" && tok.length > 1){
      const c = tok.slice(1).toLowerCase();
      if (/^\d{4}$/.test(c)){ out.year = c; return; }
      const typeMap = { pto:"PTO", vac:"PTO", vacation:"PTO", personal:"PTO", sick:"Sick", holiday:"Personal Holiday", ph:"Personal Holiday", work:"Work Event", "work event":"Work Event", conference:"Work Event", event:"Work Event", bereavement:"Bereavement", jury:"Jury Duty", unpaid:"Unpaid" };
      if (typeMap[c]){ out.type = typeMap[c]; return; }
      const mi = MONTHNAMES.findIndex(m => m.toLowerCase() === c || m.toLowerCase().slice(0,3) === c);
      if (mi >= 0){ out.month = mi; return; }
      words.push(tok); // unknown /command → treat as text
    } else words.push(tok);
  });
  out.text = words.join(" ");
  return out;
}
function getFilteredEntries(){
  const parsed = parseLogQuery(state.logSearch);
  const q = parsed.text.trim().toLowerCase();
  const type = state.logType||"All";
  const year = state.logYear||"All";
  return state.entries.filter(e => {
    if (type!=="All" && e.type!==type) return false;
    if (parsed.type && e.type !== parsed.type) return false;
    const d = parseDate(e.date);
    if (year!=="All" && String(d.getFullYear())!==String(year)) return false;
    if (parsed.year && String(d.getFullYear()) !== parsed.year) return false;
    if (parsed.month !== null && d.getMonth() !== parsed.month) return false;
    if (q){
      const hay = [e.date, fmt(d), e.type, e.status||"", e.notes||"", DAYNAMES[d.getDay()], MONTHNAMES[d.getMonth()], MONTHNAMES[d.getMonth()].slice(0,3)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function renderLogSummary(){
  const kp = $("logKpis"); if (!kp) return;
  const cfg = state.config, y = cfg.year;
  const uv = ytdUsage("PTO", y), us = ytdUsage("Sick", y);
  const uph = ytdUsage("Personal Holiday", y);
  const total = state.entries.length;
  const totalHrs = state.entries.filter(e => parseDate(e.date).getFullYear()===y).reduce((s,e)=>s+Number(e.hours||0),0);
  const otherHrs = Math.max(0, totalHrs - uv - us);
  kp.innerHTML =
    miniKpi("blue", ICO.calendar, "Total Entries", `${total}`, "v-blue", `${totalHrs.toFixed(0)} hrs logged in ${y}`) +
    miniKpi("green", ICO.palm, "PTO Used YTD", `${uv.toFixed(1)}<span class="unit">hrs</span>`, "v-green", `${(uv/cfg.workday).toFixed(1)} days in ${y}`) +
    miniKpi("magenta", ICO.sick, "Sick Used YTD", `${us.toFixed(1)}<span class="unit">hrs</span>`, "v-magenta", `${(us/cfg.workday).toFixed(1)} days in ${y}`) +
    miniKpi("amber", ICO.gift, "Personal Hol. / Other", `${otherHrs.toFixed(1)}<span class="unit">hrs</span>`, "v-amber", `${(otherHrs/cfg.workday).toFixed(1)} days in ${y}`);
}
function renderLogChart(){
  const cvs = $("logMonthChart"); if (!cvs || typeof Chart === "undefined") return;
  const y = state.config.year; const dark = document.documentElement.getAttribute('data-theme')==='dark';
  const labels = MONTHNAMES.map(m => m.slice(0,3));
  const series = {PTO:new Array(12).fill(0), Sick:new Array(12).fill(0), "Personal Holiday":new Array(12).fill(0), Other:new Array(12).fill(0)};
  state.entries.forEach(e => { const d = parseDate(e.date); if (d.getFullYear()!==y) return; const mo = d.getMonth(); const h = Number(e.hours||0);
    if (e.type==="PTO") series.PTO[mo]+=h; else if (e.type==="Sick") series.Sick[mo]+=h; else if (e.type==="Personal Holiday") series["Personal Holiday"][mo]+=h; else series.Other[mo]+=h; });
  const col = {PTO:cssVar('--data-green'), Sick:cssVar('--accent'), "Personal Holiday":cssVar('--data-magenta'), Other:cssVar('--data-amber')};
  const meta = $("logChartMeta"); if (meta) meta.textContent = `${y} · hours per month`;
  const tick = cssVar('--chart-tick'), grid = cssVar('--chart-grid');
  if (logChart) logChart.destroy();
  logChart = new Chart(cvs, {type:'bar',
    data:{labels, datasets:Object.keys(series).map(k => ({label:k, data:series[k], backgroundColor:col[k], borderRadius:3, stack:'s', maxBarThickness:24}))},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom', labels:{boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',font:{size:11},color:tick,padding:12}}, tooltip:{backgroundColor:dark?'#fff':'#0F172A',titleColor:dark?'#000':'#fff',bodyColor:dark?'#000':'#fff',padding:10,cornerRadius:8}},
      scales:{x:{stacked:true, grid:{display:false}, ticks:{font:{size:10},color:tick}, border:{display:false}}, y:{stacked:true, beginAtZero:true, grid:{color:grid,drawTicks:false}, ticks:{font:{size:10},color:tick,padding:6,callback:v=>v+'h'}, border:{display:false}}}}
  });
}
export function renderLog(){
  renderLogSummary();
  renderLogChart();
  const tb = document.querySelector("#logTable tbody");
  // Sync toolbar controls to state
  const searchEl = $("logSearch");
  const iconEl = $("logSearchIcon");
  if (iconEl && !iconEl.innerHTML) iconEl.innerHTML = ICO.search;
  const clearEl = $("logSearchClear");
  if (clearEl && !clearEl.innerHTML) clearEl.innerHTML = ICO.x;
  if (searchEl && document.activeElement !== searchEl && searchEl.value !== (state.logSearch||"")) searchEl.value = state.logSearch||"";
  if (clearEl) clearEl.classList.toggle("show", !!(state.logSearch||"").length);
  // Year filter, auto-populated from entries
  const years = [...new Set(state.entries.map(e => parseDate(e.date).getFullYear()))].sort((a,b) => b-a);
  if ((state.logYear||"All")!=="All" && !years.map(String).includes(String(state.logYear))) state.logYear = "All";
  const yearSel = $("logYearFilter");
  if (yearSel){ yearSel.innerHTML = `<option value="All">All years</option>` + years.map(y => `<option value="${y}">${y}</option>`).join(""); yearSel.value = state.logYear||"All"; }
  const typeSel = $("logTypeFilter"); if (typeSel) typeSel.value = state.logType||"All";
  const view = state.logView||"list";
  document.querySelectorAll<HTMLElement>("#logViewToggle button").forEach(b => b.classList.toggle("active", b.dataset.view === view));

  // Order from the current date, like the Friday Planner / Smart Suggestions:
  // upcoming entries first (soonest → later), then past entries (most recent → older).
  const t0 = today();
  const fromToday = (a,b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    const au = da >= t0, bu = db >= t0;
    if (au && bu) return +da - +db;      // both upcoming → soonest first
    if (!au && !bu) return +db - +da;    // both past → most recent first
    return au ? -1 : 1;                // upcoming before past
  };
  const filtered = getFilteredEntries().sort(fromToday);
  const total = state.entries.length;
  const totalGroups = groupByBatch(state.entries).length;
  const filteredGroups = groupByBatch(filtered);
  $("logCount").textContent = logIsFiltered() ? `${filteredGroups.length} of ${totalGroups} entries` : `${totalGroups} entries`;

  if (!filtered.length){
    tb.innerHTML = total === 0
      ? `<tr><td colspan="8"><div class="empty"><div class="empty-icon">${ICO.calendar}</div><h4>No entries yet</h4><p>Add your first entry using the form above.</p></div></td></tr>`
      : `<tr><td colspan="8"><div class="empty"><div class="empty-icon">${ICO.search}</div><h4>No matching entries</h4><p>No entries match your search or filters. <a href="#" onclick="clearLogFilters();return false;" style="color:var(--accent);font-weight:600">Clear filters</a></p></div></td></tr>`;
    updateLogBulkBar();
    return;
  }

  if (view === "month"){
    const groups = {};
    filtered.forEach(e => { const k = monthKey(parseDate(e.date)); (groups[k] = groups[k] || []).push(e); });
    const nowKey = monthKey(t0);
    const keys = Object.keys(groups).sort((a,b) => {
      const af = a >= nowKey, bf = b >= nowKey;    // current & future months first (ascending), then past (descending)
      if (af && bf) return a.localeCompare(b);
      if (!af && !bf) return b.localeCompare(a);
      return af ? -1 : 1;
    });
    tb.innerHTML = keys.map(k => {
      const items = groups[k];
      const [yy, mm] = k.split("-").map(Number);
      const totalHrs = items.reduce((s,e) => s + Number(e.hours||0), 0);
      const days = new Set(items.map(e => e.date)).size;
      const monthGroups = groupByBatch(items);
      const collapsed = !!(state.collapsedMonths && state.collapsedMonths[k]);
      const header = `<tr class="log-group${collapsed?' collapsed':''}" onclick="toggleMonthCollapse('${k}')"><td colspan="8"><div class="log-group-head"><span class="log-group-chev">${collapsed?ICO.chevRight:ICO.chevDown}</span><span class="log-group-title">${MONTHNAMES[mm-1]} ${yy}</span><span class="log-group-stats">${monthGroups.length} ${monthGroups.length===1?"entry":"entries"} · ${totalHrs}h · ${days} ${days===1?"day":"days"}</span></div></td></tr>`;
      return header + (collapsed ? "" : monthGroups.map(logRowHtml).join(""));
    }).join("");
  } else {
    tb.innerHTML = filteredGroups.map(logRowHtml).join("");
  }
  updateLogBulkBar();
}
// Consolidate entries that were booked together as a multi-day range (shared
// batchId) into display groups — a range shows as ONE row. Entries without a
// batchId (single days, imported rows) are their own group. Order is preserved.
function groupByBatch(entries){
  const groups = []; const byId = new Map();
  for (const e of entries){
    if (e && e.batchId){
      const g = byId.get(e.batchId);
      if (g){ g.push(e); continue; }
      const ng = [e]; byId.set(e.batchId, ng); groups.push(ng);
    } else groups.push([e]);
  }
  return groups;
}

// Render one table row for a display group (a single entry, or a consolidated
// multi-day batch shown as a date range + summed hours).
function logRowHtml(group){
  const entries = [...group].sort((a,b) => a.date.localeCompare(b.date));
  const first = entries[0], last = entries[entries.length-1];
  const single = entries.length === 1;
  const idxs = entries.map(e => state.entries.indexOf(e)).filter(i => i >= 0);
  const firstIdx = idxs[0];
  const allSel = idxs.length > 0 && idxs.every(i => selectedLog.has(i));
  const df = parseDate(first.date), dl = parseDate(last.date);
  const totalHours = entries.reduce((s,e) => s + Number(e.hours||0), 0);
  let cls = 'a';
  if (first.type==='PTO') cls='g'; else if (first.type==='Sick') cls='r'; else if (first.type==='Personal Holiday') cls='p'; else if (first.type==='Work Event') cls='b';
  const dateCell = single ? `<b>${fmt(df)}</b>` : `<b>${fmt(df,{month:"short",day:"numeric"})} – ${fmt(dl,{month:"short",day:"numeric",year:"numeric"})}</b>`;
  const dayCell = single ? DAYNAMES[df.getDay()] : `${entries.length} days`;
  const idxsAttr = idxs.join(',');
  const chk = `<td class="no-print cell-check"><input type="checkbox" class="log-check" data-idxs="${idxsAttr}" ${allSel?'checked':''} onchange="onLogCheck('${idxsAttr}',this.checked)" aria-label="Select entry"></td>`;
  return `<tr${allSel?' class="row-selected"':''}>${chk}<td data-label="Date">${dateCell}</td><td data-label="Day" style="color:var(--n-500)">${dayCell}</td><td data-label="Type"><span class="chip ${cls}">${first.type}</span></td><td data-label="Hours" class="num">${totalHours}</td><td data-label="Status"><span class="chip n">${first.status||"-"}</span></td><td data-label="Notes" style="color:var(--n-500)">${first.notes||"—"}</td><td class="cell-actions"><div style="display:flex;gap:4px;justify-content:flex-end"><button class="btn subtle sm" onclick="openEditModal(${firstIdx})" title="Edit">${ICO.edit}</button><button class="btn subtle sm" onclick="deleteEntry(${firstIdx})" title="Delete">${ICO.trash}</button></div></td></tr>`;
}
const idxList = (s) => String(s == null ? "" : s).split(',').filter(x => x !== '').map(Number);
export function onLogCheck(idxs, checked){ idxList(idxs).forEach(i => { if (checked) selectedLog.add(i); else selectedLog.delete(i); }); const tr = document.querySelector(`.log-check[data-idxs="${idxs}"]`)?.closest('tr'); if (tr) tr.classList.toggle('row-selected', checked); updateLogBulkBar(); }
export function toggleLogSelectAll(checked){ document.querySelectorAll<HTMLInputElement>('#logTable .log-check').forEach(cb => { cb.checked = checked; idxList(cb.dataset.idxs).forEach(i => { if (checked) selectedLog.add(i); else selectedLog.delete(i); }); cb.closest('tr').classList.toggle('row-selected', checked); }); updateLogBulkBar(); }
function updateLogBulkBar(){ const bar = $('logBulkBar'); const cnt = $('logBulkCount'); const n = selectedLog.size; if (bar) bar.classList.toggle('show', n>0); if (cnt) cnt.textContent = `${n} selected`; const all = $('logSelectAll'); const boxes = document.querySelectorAll<HTMLInputElement>('#logTable .log-check'); if (all) all.checked = boxes.length>0 && [...boxes].every(b=>b.checked); }
export function clearLogSelection(){ selectedLog.clear(); renderLog(); }
export function bulkStatusLog(status){ if (!selectedLog.size) return; [...selectedLog].forEach(i => { if (state.entries[i]) state.entries[i].status = status; }); const n = selectedLog.size; selectedLog.clear(); save(); refresh(); toast(`Marked ${n} as ${status}`); }
export function bulkDeleteLog(){ if (!selectedLog.size) return; const n = selectedLog.size; if (!confirm(`Delete ${n} selected ${n===1?'entry':'entries'}?`)) return; [...selectedLog].sort((a,b)=>b-a).forEach(i => { const e = state.entries[i]; if (e){ detachPH(e); state.entries.splice(i,1); } }); selectedLog.clear(); save(); refresh(); toast(`Deleted ${n} ${n===1?'entry':'entries'}`); }
function monthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
export function setLogView(v){ state.logView = v; save(); renderLog(); }
export function toggleMonthCollapse(k){ state.collapsedMonths = state.collapsedMonths || {}; if (state.collapsedMonths[k]) delete state.collapsedMonths[k]; else state.collapsedMonths[k] = true; save(); renderLog(); }
let _logSearchTimer = null;
export function onLogSearch(v){
  state.logSearch = v;
  const clearEl = $("logSearchClear"); if (clearEl) clearEl.classList.toggle("show", !!v.length);
  if (_logSearchTimer) clearTimeout(_logSearchTimer);
  _logSearchTimer = setTimeout(() => { save(); renderLog(); }, 150);
}
export function clearLogSearch(){ state.logSearch = ""; const el = $("logSearch"); if (el){ el.value = ""; el.focus(); } save(); renderLog(); }
export function onLogFilter(key, val){ state[key] = val; save(); renderLog(); }
export function clearLogFilters(){ state.logSearch = ""; state.logType = "All"; state.logYear = "All"; save(); renderLog(); }
