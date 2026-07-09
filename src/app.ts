import { DAYNAMES, DOWABBR, MONTHNAMES, parseDate, fmt, isoDate, today, isWeekend, addDays, daysBetween, weekNum, ordSuffix } from "./domain/dates.ts";
import { state, setState, save, DEFAULTS, ptoMigrate } from "./state/store.ts";
import { isHoliday, holidayName, getAllotment, ytdUsage, currentBalance, daysUntilNextRefill } from "./domain/balance.ts";
import { anniversaryFor, yearsOfService, nextMilestone, currentMilestone, anniversaryDates } from "./domain/anniversaries.ts";
import { buildSuggestions, suggestedDates, nthWeekday, usFederalHolidays, ptoOffSpan, buildAllSuggestions } from "./domain/suggestions.ts";
import { icsEscape, icsFold, csvCell, parseCSVText, parseHtmlTable, ingestEntryRows } from "./domain/importexport.ts";
import { getPersonalHoliday, isEligibleForPH, personalHolidayDates, reconcilePersonalHolidays } from "./domain/personalholiday.ts";
import { buildInsights, insightId, insightHtml, isNotifType, liveInsights, DASH_INSIGHT_MAX } from "./ui/insights.ts";
import { buildChartData, usageThisVsLast, vacCumulativeByMonth } from "./domain/charts.ts";
import { toast, cssVar, esc, ringSVG, ringSVG2, miniKpi, sparklineSVG } from "./ui/dom.ts";
import { renderAnniversaries, updateTier } from "./ui/views/anniversaries.ts";
import { ICO } from "./ui/icons.ts";

let calCursor = new Date();
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
  setTimeout(() => { if (balChart && balChart.resize) balChart.resize(); if (pieChart && pieChart.resize) pieChart.resize(); }, 300);
}
function updateSidebarToggleA11y(){
  const btn = document.getElementById('sidebarCollapse'); if (!btn) return;
  const collapsed = document.documentElement.getAttribute('data-sidebar') === 'collapsed';
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  btn.title = (collapsed ? 'Expand' : 'Collapse') + ' sidebar (Ctrl/Cmd+B)';
}



// FRIDAY APPOINTMENTS — get scheduled/done ones for calendar overlay
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

// ===== SuggestionEngine (PTO-504) — pluggable strategies grouped by category =====
const SUG_CATS = {
  company:  {label:"Company holidays",     chip:"v", color:"violet",  icon:ICO.gift,      order:1},
  federal:  {label:"Federal long weekends",chip:"c", color:"cyan",    icon:ICO.calendar,  order:2},
  weekend:  {label:"Long weekends",        chip:"a", color:"warn",    icon:ICO.star,      order:3},
  personal: {label:"Personal",             chip:"p", color:"pink",    icon:ICO.celebrate, order:4},
  balance:  {label:"Balance plan",         chip:"g", color:"success", icon:ICO.used,      order:5}
};
function toggleSugFilter(cat){ state.sugFilters = state.sugFilters || {}; state.sugFilters[cat] = state.sugFilters[cat] === false ? true : false; save(); renderSuggestions(); }



let balChart, pieChart, logChart;
let selectedLog = new Set();

function renderGreeting(){
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const first = (state.config.name || "there").split(" ")[0];
  const g = document.getElementById("dashGreeting"); if (g) g.innerHTML = `Good ${part}, ${first}! <span style="font-weight:400">👋</span>`;
  const s = document.getElementById("dash-sub"); if (s) s.textContent = `Here's your time-off overview for ${fmt(today(),{weekday:"long",month:"long",day:"numeric",year:"numeric"})}`;
}
function renderKPIs(){
  const cfg = state.config; const bal = currentBalance();
  const uv = ytdUsage("PTO", cfg.year); const us = ytdUsage("Sick", cfg.year);
  const allot = getAllotment(cfg.year); const daysToRefill = daysUntilNextRefill();
  const sickIsNA = allot.sick === null; const sickBal = sickIsNA ? null : allot.sick - us;
  const usedPct = allot.vacation ? Math.round(uv/allot.vacation*100) : 0;
  const tr = usageThisVsLast();
  const link = (fn, title) => `role="button" tabindex="0" title="${title}" onclick="${fn}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${fn}}"`;
  const chev = `<svg class="kpi-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  const calICO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const ringCls = usedPct>=100?'r':usedPct>=70?'a':'g';
  const refillDate = addDays(today(), daysToRefill);
  // Card 2 footer (delta vs last month; down = good)
  let k2foot;
  if (tr.diff > 0) k2foot = `<div class="kpi-foot neg"><span>▲</span> ${tr.diff.toFixed(1)} hrs vs last month</div>`;
  else if (tr.diff < 0) k2foot = `<div class="kpi-foot pos"><span>▼</span> ${Math.abs(tr.diff).toFixed(1)} hrs vs last month</div>`;
  else k2foot = `<div class="kpi-foot">No change vs last month</div>`;
  // Personal holiday (reflect any Personal Holiday entry logged elsewhere)
  const y = cfg.year;
  if (reconcilePersonalHolidays()) save();
  const ph = getPersonalHoliday(y), elig = isEligibleForPH();
  let phLine, phSub, phAction = "";
  if (!elig.eligible){ phLine = `${calICO} Not eligible`; phSub = `Eligible ${fmt(elig.eligibleOn,{month:"short",day:"numeric"})}`; }
  else if (ph.status==="Scheduled" || ph.status==="Taken"){
    const d = parseDate(ph.date); phLine = `${calICO} ${fmt(d,{month:"short",day:"numeric"})}`; phSub = ph.status==="Taken" ? "Taken ✓" : fmt(d,{weekday:"long"});
    const view = `<button class="btn subtle sm" style="margin-top:12px;width:100%" onclick="viewInCalendar('${ph.date}')">View in calendar</button>`;
    phAction = ph.status==="Taken"
      ? view + `<button class="btn ghost sm" style="margin-top:6px;width:100%;color:var(--accent)" onclick="unschedulePersonalHoliday(${y})">Reset</button>`
      : view + `<div style="display:flex;gap:6px;margin-top:6px"><button class="btn ghost sm" style="flex:1" onclick="markPersonalHolidayTaken(${y})">Mark taken</button><button class="btn ghost sm" style="flex:1;color:var(--accent)" onclick="unschedulePersonalHoliday(${y})">Unschedule</button></div>`;
  }
  else { phLine = `${calICO} Not scheduled`; phSub = "1 day available"; phAction = `<label class="btn pink-cta">${calICO} Pick a date<input type="date" id="ph_date_${y}" min="${isoDate(today())}" max="${y}-12-31" onclick="event.stopPropagation();try{this.showPicker()}catch(e){}" onchange="schedulePersonalHoliday(${y})"/></label>`; }
  // Next anniversary
  const nxt = nextMilestone(); let annVal, annSub, annFoot;
  if (nxt){ const du = nxt.daysUntil, yy = Math.floor(du/365), dd = du - yy*365; annVal = `${yy>0?yy+'y ':''}${dd}d`; annSub = nxt.label; annFoot = `${fmt(nxt.date,{month:"short",day:"numeric",year:"numeric"})} (${fmt(nxt.date,{weekday:"long"})})`; }
  else { annVal = "Max"; annSub = "Top tier reached"; annFoot = ""; }

  document.getElementById("kpis").innerHTML = `
    <div class="kpi kpi-link" ${link("dashDrillLog('PTO')","View PTO entries")}>
      <div class="kpi-top"><div class="kpi-icon green">${ICO.palm}</div><span class="kpi-title">PTO Balance</span></div>
      <div class="kpi-body">
        <div class="kpi-main"><div class="kpi-value v-green">${bal.toFixed(1)}<span class="unit">hrs</span></div><div class="kpi-sub">${(bal/cfg.workday).toFixed(1)} days of ${allot.vacation} hrs</div></div>
        ${ringSVG2(usedPct, ringCls)}
      </div>
      <div class="kpi-foot">${calICO} Next refill: ${fmt(refillDate,{month:"short",day:"numeric",year:"numeric"})} (${daysToRefill} days)</div>
    </div>
    <div class="kpi kpi-link" ${link("dashDrillLogYear("+cfg.year+")","View this year's entries")}>
      <div class="kpi-top"><div class="kpi-icon purple">${ICO.used}</div><span class="kpi-title">PTO Used YTD</span></div>
      <div class="kpi-body">
        <div class="kpi-main"><div class="kpi-value v-purple">${uv.toFixed(1)}<span class="unit">hrs</span></div><div class="kpi-sub">${(uv/cfg.workday).toFixed(1)} days of ${allot.vacation} hrs</div></div>
        <div class="kpi-sparkbox">${sparklineSVG(vacCumulativeByMonth(cfg.year))}</div>
      </div>
      ${k2foot}
    </div>
    ${sickIsNA
      ? `<div class="kpi kpi-link" ${link("dashDrillLog('Sick')","View sick entries")}>
          <div class="kpi-top"><div class="kpi-icon blue">${ICO.sick}</div><span class="kpi-title">Sick Balance</span></div>
          <div class="kpi-body"><div class="kpi-main"><div class="kpi-value v-blue" style="color:var(--data-blue)">N/A</div><div class="kpi-sub">Not set</div></div><div class="kpi-qmark">?</div></div>
          <div class="kpi-foot">Confirm accrual with HR</div>
        </div>`
      : `<div class="kpi kpi-link" ${link("dashDrillLog('Sick')","View sick entries")}>
          <div class="kpi-top"><div class="kpi-icon blue">${ICO.sick}</div><span class="kpi-title">Sick Balance</span></div>
          <div class="kpi-body"><div class="kpi-main"><div class="kpi-value v-blue">${sickBal.toFixed(1)}<span class="unit">hrs</span></div><div class="kpi-sub">${(sickBal/cfg.workday).toFixed(1)} days of ${allot.sick} hrs</div></div></div>
        </div>`}
    <div class="kpi">
      <div class="kpi-top"><div class="kpi-icon magenta">${ICO.gift}</div><span class="kpi-title pink">Personal Holiday</span></div>
      <div class="kpi-ph-line">${phLine}</div>
      <div class="kpi-sub">${phSub}</div>${phAction}
    </div>
    <div class="kpi kpi-link" ${link("switchTab('ann')","View anniversaries")}>
      <div class="kpi-top"><div class="kpi-icon amber">${ICO.award}</div><span class="kpi-title">Next Anniversary</span>${chev}</div>
      <div class="kpi-body"><div class="kpi-main"><div class="kpi-value v-amber">${annVal}</div><div class="kpi-sub">${annSub}</div></div></div>
      ${annFoot ? `<div class="kpi-foot">${annFoot}</div>` : ""}
    </div>`;
}
function dashDrillLog(type){ state.logType = type||"All"; state.logYear = "All"; state.logSearch = ""; save(); switchTab("log"); renderLog(); }
function dashDrillLogYear(year){ state.logType = "All"; state.logYear = String(year); state.logSearch = ""; save(); switchTab("log"); renderLog(); }
function drillFriday(iso){ switchTab("fri"); setTimeout(() => { const row = document.getElementById("fri-"+iso); if (row){ row.scrollIntoView({block:"center"}); row.classList.add("row-flash"); setTimeout(()=>row.classList.remove("row-flash"), 1200); } }, 60); }
function setChartRange(m){ state.chartRange = m; save(); document.querySelectorAll("#rangeToggle button").forEach(b => b.classList.toggle("active", Number(b.dataset.range) === m)); renderCharts(); }

function renderPersonalHolidayStrip(){
  const el = document.getElementById("phStrip");
  if (!el) return; // PH now lives in a KPI card on the dashboard
  const y = state.config.year; const ph = getPersonalHoliday(y); const elig = isEligibleForPH();
  let primary = "", actions = "";
  if (!elig.eligible){ const daysToEligible = daysBetween(today(), elig.eligibleOn); primary = `<span class="ph-primary muted">Eligible in ${daysToEligible} days · ${fmt(elig.eligibleOn,{month:"short",day:"numeric",year:"numeric"})}</span>`; }
  else if (ph.status === "Unscheduled"){ primary = `<span class="ph-primary muted">Not scheduled · ${y}</span>`; actions = `<input type="date" id="ph_date_${y}" style="width:170px" min="${isoDate(today())}" max="${y}-12-31"/><button class="btn sm" onclick="schedulePersonalHoliday(${y})">Schedule</button>`; }
  else if (ph.status === "Scheduled" || ph.status === "Taken"){
    const d = parseDate(ph.date); const isPast = d < today();
    const takenBadge = ph.status === "Taken" ? '<span class="chip g" style="margin-left:8px">✓ Taken</span>' : '';
    primary = `<span class="ph-primary">${fmt(d,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}${takenBadge}</span>`;
    actions = `${!isPast && ph.status==="Scheduled" ? `<button class="btn subtle sm" onclick="markPersonalHolidayTaken(${y})" title="Mark as taken">${ICO.check}</button>` : ''}<button class="btn subtle sm" onclick="viewInCalendar('${ph.date}')" title="View in calendar">${ICO.calendar}</button><button class="btn subtle sm" onclick="unschedulePersonalHoliday(${y})" title="Unschedule">${ICO.minus}</button>`;
  } else if (ph.status === "Forfeited"){ primary = `<span class="ph-primary muted">Forfeited · ${y}</span>`; }
  el.innerHTML = `<div class="ph-strip"><div class="ph-icon">${ICO.gift}</div><div class="ph-content"><span class="ph-title">Personal Holiday · ${y}</span>${primary}</div><div class="ph-actions">${actions}</div></div>`;
}

function schedulePersonalHoliday(year){
  const input = document.getElementById(`ph_date_${year}`);
  if (!input || !input.value){ toast("Pick a date first"); return; }
  const d = input.value; const parsed = parseDate(d);
  if (parsed.getFullYear() !== year){ toast("Date must be in " + year); return; }
  if (isWeekend(parsed)){ toast("Pick a weekday"); return; }
  if (isHoliday(parsed)){ toast("That's already a company holiday"); return; }
  const ph = getPersonalHoliday(year);
  ph.date = d; ph.status = "Scheduled"; ph.notes = "Personal holiday (CCCI benefit)";
  if (!state.entries.find(e => e.date === d && e.type === "Personal Holiday")){
    state.entries.push({date:d, type:"Personal Holiday", hours:state.config.workday, status:"Approved", notes:"CCCI personal holiday"});
  }
  save(); calCursor = new Date(parsed.getFullYear(), parsed.getMonth(), 1); refresh();
  toast(`Personal holiday scheduled — ${fmt(parsed,{weekday:"short",month:"short",day:"numeric"})}`);
  switchTab("cal");
}
function unschedulePersonalHoliday(year){
  if (!confirm("Remove the scheduled personal holiday? This will also delete the log entry.")) return;
  const ph = getPersonalHoliday(year); const dateToRemove = ph.date;
  ph.date = null; ph.status = "Unscheduled"; ph.notes = "";
  if (dateToRemove) state.entries = state.entries.filter(e => !(e.date === dateToRemove && e.type === "Personal Holiday"));
  save(); refresh(); toast("Personal holiday unscheduled");
}
function markPersonalHolidayTaken(year){
  const ph = getPersonalHoliday(year); ph.status = "Taken";
  const entry = state.entries.find(e => e.date === ph.date && e.type === "Personal Holiday");
  if (entry) entry.status = "Taken";
  save(); refresh(); toast("Marked as taken");
}

function renderCharts(){
  const points = buildChartData(); const cfg = state.config; const dark = getTheme()==='dark';
  const gridColor = cssVar('--chart-grid'); const tickColor = cssVar('--chart-tick');
  const lineColor = cssVar('--chart-line'); const fill1 = cssVar('--chart-fill-1'); const fill2 = cssVar('--chart-fill-2');
  const usageColor = cssVar('--chart-usage'); const usageFill = cssVar('--chart-usage-fill');
  const tooltipBg = dark ? '#fff' : '#0F172A'; const tooltipText = dark ? '#000' : '#FFFFFF';
  const range = state.chartRange || 12;
  const displayPoints = points.slice(0, range === 0 ? points.length : Math.min(points.length, range + 1));
  const labels = displayPoints.map(p => p.shortLabel);
  const balances = displayPoints.map(p => p.balance); const usedYTD = displayPoints.map(p => p.usedYTD);
  const yearBoundaries = [];
  for (let i = 1; i < displayPoints.length; i++){
    if (displayPoints[i].year !== displayPoints[i-1].year){
      yearBoundaries.push({index: i - 0.5, year: displayPoints[i].year, allotment: displayPoints[i].allotment});
    }
  }
  const bal = currentBalance(); const usedYTDCurrent = ytdUsage("PTO", cfg.year);
  const nextAllot = getAllotment(cfg.year+1); const daysToRefill = daysUntilNextRefill();
  document.getElementById("chartSummary").innerHTML = `
    <div class="chart-stat balance"><span class="lbl">Current balance</span><span class="val">${bal.toFixed(0)}<span class="unit">hrs</span></span></div>
    <div class="chart-stat usage"><span class="lbl">Used YTD</span><span class="val">${usedYTDCurrent.toFixed(0)}<span class="unit">hrs</span></span></div>
    <div class="chart-stat refill"><span class="lbl">Next refill</span><span class="val">+${nextAllot.vacation}<span class="unit">hrs · Jan 1</span></span></div>
    <div class="chart-stat until"><span class="lbl">Until refill</span><span class="val">${daysToRefill}<span class="unit">days</span></span></div>`;
  const annotations = {};
  yearBoundaries.forEach((yb, i) => {
    annotations['year_' + i] = { type: 'line', xMin: yb.index, xMax: yb.index, borderColor: dark ? 'rgba(115,115,115,.4)' : 'rgba(100,116,139,.35)', borderWidth: 1, borderDash: [4, 4], label: { display: true, content: `Jan 1 ${yb.year}`, position: 'start', backgroundColor: dark ? '#1a1a1a' : '#F8FAFC', color: dark ? '#e5e5e5' : '#334155', font: {size: 10, weight: 600}, padding: {x:6,y:3}, borderRadius: 4, yAdjust: -6 } };
  });
  if (balChart) balChart.destroy();
  balChart = new Chart(document.getElementById("balChart"), {
    type:"line",
    data:{labels, datasets:[
      {label:"Balance", data:balances, borderColor: lineColor, backgroundColor:(ctx)=>{const c=ctx.chart.ctx; const g=c.createLinearGradient(0,0,0,280); g.addColorStop(0,fill1); g.addColorStop(1,fill2); return g;}, tension:.35, fill:true, pointRadius:0, pointHoverRadius:6, borderWidth:2.5, pointBackgroundColor:lineColor, pointBorderColor:'#fff', pointBorderWidth:2, order: 2},
      {label:"Used YTD", data:usedYTD, borderColor: usageColor, backgroundColor: usageFill, tension:.3, fill:false, pointRadius:0, pointHoverRadius:5, borderWidth:2, borderDash:[6,4], pointBackgroundColor: usageColor, pointBorderColor:'#fff', pointBorderWidth:2, order: 1}
    ]},
    options:{responsive:true, maintainAspectRatio:false, interaction: {mode:'index', intersect:false},
      plugins:{legend:{display:false}, annotation: {annotations}, tooltip:{backgroundColor:tooltipBg, titleColor:tooltipText, bodyColor:tooltipText, titleFont:{size:12,weight:600}, bodyFont:{size:12}, padding:12, cornerRadius:8, displayColors:true, boxWidth:8, boxHeight:8, boxPadding:6,
        callbacks: {
          title: (items) => { if (!items.length) return ''; const p = displayPoints[items[0].dataIndex]; return `${MONTHNAMES[p.month]} ${p.year}`; },
          label: (ctx) => { const p = displayPoints[ctx.dataIndex]; if (ctx.dataset.label === 'Balance'){ return `  Balance: ${ctx.parsed.y.toFixed(1)} hrs (${(ctx.parsed.y/cfg.workday).toFixed(1)} days)`; } return `  Used YTD: ${ctx.parsed.y.toFixed(1)} hrs`; },
          afterBody: (items) => { if (!items.length) return ''; const p = displayPoints[items[0].dataIndex]; if (p.usedThisMonth > 0) return [`  This month: ${p.usedThisMonth.toFixed(1)} hrs used`]; return ''; }
        }
      }},
      scales:{y:{beginAtZero:true, grid:{color:gridColor, drawTicks:false}, ticks:{font:{size:10}, color:tickColor, padding:8, callback: (v) => v+' hrs'}, border:{display:false}}, x:{grid:{display:false}, ticks:{font:{size:10}, color:tickColor, maxRotation:0, autoSkip:false, padding:6}, border:{display:false}}}
    }
  });
  const uv = ytdUsage("PTO",cfg.year), us = ytdUsage("Sick",cfg.year), uph = ytdUsage("Personal Holiday",cfg.year);
  const allot = getAllotment(cfg.year); const rem = Math.max(0, allot.vacation - uv);
  const donutColors = dark ? ['#34D399','#F87171','#F472B6','#2a2a2a'] : ['#059669','#DC2626','#DB2777','#E2E8F0'];
  const donutBorder = dark ? '#0a0a0a' : '#FFFFFF';
  const totalUsed = uv + us + uph;
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById("pieChart"), {
    type:"doughnut",
    data:{labels:["PTO used","Sick used","Personal Holiday","PTO remaining"], datasets:[{data:[uv,us,uph,rem], backgroundColor:donutColors, borderWidth:2, borderColor:donutBorder}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:"70%", plugins:{legend:{display:false}, tooltip:{backgroundColor:tooltipBg, titleColor:tooltipText, bodyColor:tooltipText, padding:10, cornerRadius:8}}}
  });
  // Center label + custom legend
  const donutWrap = document.querySelector(".usage-donut");
  if (donutWrap){ let ctr = donutWrap.querySelector(".donut-center"); if (!ctr){ ctr = document.createElement("div"); ctr.className = "donut-center"; donutWrap.appendChild(ctr); } ctr.innerHTML = `<span class="dc-val">${totalUsed.toFixed(1)}</span><span class="dc-lbl">hrs used</span>`; }
  const legEl = document.getElementById("usageLegend");
  if (legEl){
    const denom = allot.vacation || (totalUsed + rem) || 1;
    const rows = [
      {n:"PTO", v:uv, c:donutColors[0]},
      {n:"Personal Holiday", v:uph, c:donutColors[2]},
      {n:"Sick", v:us, c:donutColors[1]},
      {n:"Remaining", v:rem, c:donutColors[3]}
    ].filter(r => r.v > 0 || r.n === "PTO" || r.n === "Remaining");
    legEl.innerHTML = rows.map(r => `<div class="ul-row"><span class="ul-dot" style="background:${r.c}"></span><span class="ul-name">${r.n}</span><span class="ul-val">${r.v.toFixed(1)} hrs (${Math.round(r.v/denom*100)}%)</span></div>`).join("");
  }
}

function renderInsights(){
  const all = buildInsights().map(i => ({...i, id: insightId(i), dismissable: i.t !== "critical"}));
  const dismissed = new Set(state.dismissedInsights || []);
  const dashOnly = i => !isNotifType(i.t);
  const visible = all.filter(i => dashOnly(i) && !(i.dismissable && dismissed.has(i.id))).slice(0, DASH_INSIGHT_MAX);
  const hiddenOnes = all.filter(i => dashOnly(i) && i.dismissable && dismissed.has(i.id));
  document.getElementById("insightCount").textContent = visible.length;
  const btn = document.getElementById("showDismissedBtn");
  if (btn){
    if (hiddenOnes.length){ btn.style.display = ""; btn.textContent = state.showDismissed ? "Hide dismissed" : `Show dismissed (${hiddenOnes.length})`; }
    else { btn.style.display = "none"; }
  }
  const dab = document.getElementById("dismissAllBtn");
  if (dab) dab.style.display = visible.some(i => i.dismissable) ? "" : "none";
  let rows = visible.map(i => insightHtml(i, false));
  if (state.showDismissed) rows = rows.concat(hiddenOnes.map(i => insightHtml(i, true)));
  document.getElementById("insights").innerHTML = rows.length
    ? rows.join("")
    : `<div class="empty"><div class="empty-icon">${ICO.info}</div><h4>No insights yet</h4><p>Add some time-off entries to see recommendations.</p></div>`;
  refreshNotifDot();
}
function notifUnreadCount(){
  const dismissed = new Set(state.dismissedInsights || []);
  const seen = new Set(state.notificationsSeen || []);
  // Notifications actually sitting in the tray (un-dismissed) that haven't been marked read.
  return activeNotifs()
    .filter(i => !((i.t !== "critical") && dismissed.has(i.id)))
    .filter(i => !seen.has(i.id)).length;
}
function refreshNotifDot(){
  const dot = document.getElementById("notifDot"); if (!dot) return;
  dot.style.display = notifUnreadCount() > 0 ? "" : "none";
}
let _notifUnread = new Set();
function notifTabFor(i){
  if (/anniversary|milestone/i.test(i.h)) return 'ann';
  if (/recommendation/i.test(i.h)) return 'sug';
  if (/sick allotment/i.test(i.h)) return 'cfg';
  if (/personal holiday/i.test(i.h)) return 'cal';
  return 'dash';
}
// Notifications = alert-type insights (critical / warn); dashboard keeps good / info.
function activeNotifs(){ return liveInsights().filter(i => isNotifType(i.t)); }
function renderNotifPanel(){
  const list = document.getElementById("notifList"); if (!list) return;
  const dismissed = new Set(state.dismissedInsights || []);
  const all = activeNotifs().map(i => ({...i, dismissable: i.t !== "critical"})).filter(i => !(i.dismissable && dismissed.has(i.id)));
  const mr = document.getElementById("notifMarkRead"); if (mr) mr.style.display = all.length ? "" : "none";
  if (!all.length){ list.innerHTML = `<div class="notif-empty">${ICO.check}<div>You're all caught up.</div></div>`; return; }
  list.innerHTML = all.map(i => {
    const unread = _notifUnread.has(i.id);
    const plain = i.b.replace(/<[^>]+>/g, "");
    const act = i.action ? `<button class="btn ghost sm notif-act" onclick="event.stopPropagation();closeNotifPanel();${i.action.fn}">${i.action.label} →</button>` : "";
    const right = i.dismissable
      ? `<button class="notif-dismiss" onclick="event.stopPropagation();dismissNotif('${i.id}')" title="Dismiss" aria-label="Dismiss notification">${ICO.x}</button>`
      : (unread ? `<span class="notif-udot"></span>` : "");
    return `<div class="notif-item ${unread?'unread':''}" role="button" tabindex="0" onclick="openNotif('${i.id}','${notifTabFor(i)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openNotif('${i.id}','${notifTabFor(i)}')}"><div class="notif-ic ${i.t}">${i.icon}</div><div class="notif-tbody"><div class="nt">${i.h}</div><div class="nb">${plain}</div>${act}</div>${right}</div>`;
  }).join("");
}
function dismissNotif(id){
  state.dismissedInsights = state.dismissedInsights || [];
  if (!state.dismissedInsights.includes(id)) state.dismissedInsights.push(id);
  save(); renderNotifPanel(); refreshNotifDot(); if (typeof renderInsights === "function") renderInsights();
}
function toggleNotifPanel(ev){
  if (ev) ev.stopPropagation();
  const p = document.getElementById("notifPanel"); const btn = document.getElementById("notifBtn"); if (!p) return;
  if (p.classList.contains("open")){ closeNotifPanel(); return; }
  closeUserMenu();
  const seen = new Set(state.notificationsSeen || []);
  _notifUnread = new Set(activeNotifs().map(i => i.id).filter(id => !seen.has(id)));
  renderNotifPanel();
  p.classList.add("open"); if (btn) btn.setAttribute("aria-expanded","true");
  // The dot stays until items are dismissed or "Mark all read" is used — so the bell
  // keeps flagging pending, unread notifications rather than clearing on a single glance.
}
function closeNotifPanel(){ const p = document.getElementById("notifPanel"); const btn = document.getElementById("notifBtn"); if (p) p.classList.remove("open"); if (btn) btn.setAttribute("aria-expanded","false"); }
function markAllNotifsRead(){ state.notificationsSeen = activeNotifs().map(i => i.id); save(); _notifUnread = new Set(); renderNotifPanel(); refreshNotifDot(); }
function toggleUserMenu(ev){
  if (ev) ev.stopPropagation();
  const w = document.querySelector(".user-wrap"); const m = document.getElementById("userMenu"); const btn = document.getElementById("userChipBtn");
  if (!w || !m) return;
  if (m.classList.contains("open")){ closeUserMenu(); return; }
  closeNotifPanel();
  m.classList.add("open"); w.classList.add("open"); if (btn) btn.setAttribute("aria-expanded","true");
}
function closeUserMenu(){ const w = document.querySelector(".user-wrap"); const m = document.getElementById("userMenu"); const btn = document.getElementById("userChipBtn"); if (m) m.classList.remove("open"); if (w) w.classList.remove("open"); if (btn) btn.setAttribute("aria-expanded","false"); }
function openNotif(id, tab){
  closeNotifPanel();
  switchTab(tab);
  if (tab === 'dash'){ const el = document.getElementById("insights"); if (el) setTimeout(() => el.scrollIntoView({behavior:"smooth", block:"nearest"}), 90); }
}
function dismissInsight(id){ state.dismissedInsights = state.dismissedInsights || []; if (!state.dismissedInsights.includes(id)) state.dismissedInsights.push(id); save(); renderInsights(); }
function restoreInsight(id){ state.dismissedInsights = (state.dismissedInsights || []).filter(x => x !== id); if (!(state.dismissedInsights.length)) state.showDismissed = false; save(); renderInsights(); }
function toggleShowDismissed(){ state.showDismissed = !state.showDismissed; save(); renderInsights(); }
function dismissAllInsights(){
  const all = buildInsights().map(i => ({...i, id: insightId(i), dismissable: i.t !== "critical"}));
  state.dismissedInsights = state.dismissedInsights || [];
  all.filter(i => i.dismissable).forEach(i => { if (!state.dismissedInsights.includes(i.id)) state.dismissedInsights.push(i.id); });
  save(); renderInsights();
}

function renderUpcoming(){
  const t = today(); const items = [];
  const dotFor = ty => ty==='PTO'?'green':ty==='Sick'?'red':ty==='Personal Holiday'?'magenta':'blue';
  // Time-off entries
  state.entries.forEach(e => { const d = parseDate(e.date); if (d >= t) items.push({d, date:e.date, dot:dotFor(e.type), label:e.type, right:`<span class="chip b">${Number(e.hours).toFixed(1)} hrs</span>`}); });
  // Friday appointments
  const sf = state.fridays || {};
  Object.keys(sf).forEach(iso => { const it = sf[iso]; if (it && it.purpose && it.status !== "Cancelled"){ const d = parseDate(iso); if (d >= t) items.push({d, date:iso, dot:'blue', label:esc(it.purpose), right:`<span class="chip c">Friday Appt</span>`, fri:true}); } });
  // Company holidays
  (state.holidays || []).forEach(h => { const d = parseDate(h.date); if (d >= t) items.push({d, date:h.date, dot:'purple', label:esc(h.name), right:`<span class="chip v">Holiday</span>`}); });
  items.sort((a,b) => a.d - b.d);
  const up = items.slice(0, 6);
  if (!up.length){ document.getElementById("upcoming").innerHTML = `<div class="empty"><div class="empty-icon">${ICO.calendar}</div><h4>Nothing scheduled</h4><p>A good week to plan a trip.</p></div>`; return; }
  document.getElementById("upcoming").innerHTML = `<div class="up-list">` + up.map(e => {
    const onclick = e.fri ? `drillFriday('${e.date}')` : `viewInCalendar('${e.date}')`;
    return `<div class="up-row" onclick="${onclick}"><span class="up-dot ${e.dot}"></span><span class="up-date">${fmt(e.d,{weekday:"short",month:"short",day:"numeric"})}</span><span class="up-label">${e.label}</span><span class="up-right">${e.right}</span></div>`;
  }).join("") + `</div><a class="up-viewall" onclick="switchTab('cal')">View all →</a>`;
}
function renderHistory(){
  const el = document.getElementById("history"); if (!el) return;
  const t = today(); const items = [];
  const dotFor = ty => ty==='PTO'?'green':ty==='Sick'?'red':ty==='Personal Holiday'?'magenta':'blue';
  // Past time-off entries
  state.entries.forEach(e => { const d = parseDate(e.date); if (d < t) items.push({d, date:e.date, dot:dotFor(e.type), label:e.type, right:`<span class="chip b">${Number(e.hours).toFixed(1)} hrs</span>`}); });
  // Completed Friday appointments
  const sf = state.fridays || {};
  Object.keys(sf).forEach(iso => { const it = sf[iso]; if (it && it.purpose && it.status === "Done"){ const d = parseDate(iso); if (d < t) items.push({d, date:iso, dot:'blue', label:esc(it.purpose), right:`<span class="chip c">Friday</span>`, fri:true}); } });
  // Past company holidays
  (state.holidays || []).forEach(h => { const d = parseDate(h.date); if (d < t) items.push({d, date:h.date, dot:'purple', label:esc(h.name), right:`<span class="chip v">Holiday</span>`}); });
  items.sort((a,b) => b.d - a.d);   // most recent first
  const past = items.slice(0, 8);
  if (!past.length){ el.innerHTML = `<div class="empty"><div class="empty-icon">${ICO.clock}</div><h4>No past events yet</h4><p>Time off you've taken will show up here.</p></div>`; return; }
  el.innerHTML = `<div class="up-list">` + past.map(e => {
    const onclick = e.fri ? `drillFriday('${e.date}')` : `viewInCalendar('${e.date}')`;
    return `<div class="up-row" onclick="${onclick}"><span class="up-dot ${e.dot}"></span><span class="up-date">${fmt(e.d,{weekday:"short",month:"short",day:"numeric"})}</span><span class="up-label">${e.label}</span><span class="up-right">${e.right}</span></div>`;
  }).join("") + `</div><a class="up-viewall" onclick="switchTab('log')">View all in log →</a>`;
}
function renderUpcomingFridays(){
  const el = document.getElementById("upcomingFridays"); if (!el) return;
  const t = today();
  const endOfYear = new Date(t.getFullYear(), 11, 31);
  let d = new Date(t); while (d.getDay() !== 5) d = addDays(d, 1); // next Friday (today if it's Friday)
  const sf = state.fridays || {};
  const fris = [];
  while (d <= endOfYear && fris.length < 4){ fris.push(new Date(d)); d = addDays(d, 7); }
  if (!fris.length){ el.innerHTML = `<div class="empty"><div class="empty-icon">${ICO.calendar}</div><h4>No more Fridays this year</h4><p>Check back in January.</p></div>`; return; }
  el.innerHTML = `<div class="up-cards">` + fris.map((f, i) => {
    const iso = isoDate(f); const item = sf[iso]; const hol = holidayName(f);
    const flag = i === 0 ? "Today" : i === 1 ? "Next" : `In ${i} wks`;
    const scheduled = item && item.purpose && item.status !== "Cancelled";
    const purpose = scheduled ? esc(item.purpose) : (hol ? esc(hol) : "Open");
    return `<div class="up-card" title="Open Friday Planner" onclick="drillFriday('${iso}')"><div class="uc-top"><div><div class="uc-date">${fmt(f,{weekday:"short",month:"short",day:"numeric"})}</div><div class="uc-dow">WFH Friday</div></div><span class="uc-flag ${i===0?'today':''}">${flag}</span></div><div class="uc-purpose ${scheduled?'':'open'}">${purpose}</div><div class="uc-foot">${ICO.calendar}</div></div>`;
  }).join("") + `</div>`;
}

// ============ EDITABLE LOG ============
function logIsFiltered(){
  return !!((state.logSearch||"").trim()) || (state.logType||"All")!=="All" || (state.logYear||"All")!=="All";
}
// Parse slash-commands out of the search box (e.g. "/vac /2026 /jul dentist")
function parseLogQuery(raw){
  const out = { type:null, year:null, month:null, text:[] };
  (raw||"").split(/\s+/).forEach(tok => {
    if (!tok) return;
    if (tok[0] === "/" && tok.length > 1){
      const c = tok.slice(1).toLowerCase();
      if (/^\d{4}$/.test(c)){ out.year = c; return; }
      const typeMap = { pto:"PTO", vac:"PTO", vacation:"PTO", personal:"PTO", sick:"Sick", holiday:"Personal Holiday", ph:"Personal Holiday", bereavement:"Bereavement", jury:"Jury Duty", unpaid:"Unpaid" };
      if (typeMap[c]){ out.type = typeMap[c]; return; }
      const mi = MONTHNAMES.findIndex(m => m.toLowerCase() === c || m.toLowerCase().slice(0,3) === c);
      if (mi >= 0){ out.month = mi; return; }
      out.text.push(tok); // unknown /command → treat as text
    } else out.text.push(tok);
  });
  out.text = out.text.join(" ");
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
  const kp = document.getElementById("logKpis"); if (!kp) return;
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
  const cvs = document.getElementById("logMonthChart"); if (!cvs || typeof Chart === "undefined") return;
  const y = state.config.year; const dark = getTheme()==='dark';
  const labels = MONTHNAMES.map(m => m.slice(0,3));
  const series = {PTO:new Array(12).fill(0), Sick:new Array(12).fill(0), "Personal Holiday":new Array(12).fill(0), Other:new Array(12).fill(0)};
  state.entries.forEach(e => { const d = parseDate(e.date); if (d.getFullYear()!==y) return; const mo = d.getMonth(); const h = Number(e.hours||0);
    if (e.type==="PTO") series.PTO[mo]+=h; else if (e.type==="Sick") series.Sick[mo]+=h; else if (e.type==="Personal Holiday") series["Personal Holiday"][mo]+=h; else series.Other[mo]+=h; });
  const col = {PTO:cssVar('--data-green'), Sick:cssVar('--accent'), "Personal Holiday":cssVar('--data-magenta'), Other:cssVar('--data-amber')};
  const meta = document.getElementById("logChartMeta"); if (meta) meta.textContent = `${y} · hours per month`;
  const tick = cssVar('--chart-tick'), grid = cssVar('--chart-grid');
  if (logChart) logChart.destroy();
  logChart = new Chart(cvs, {type:'bar',
    data:{labels, datasets:Object.keys(series).map(k => ({label:k, data:series[k], backgroundColor:col[k], borderRadius:3, stack:'s', maxBarThickness:24}))},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom', labels:{boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',font:{size:11},color:tick,padding:12}}, tooltip:{backgroundColor:dark?'#fff':'#0F172A',titleColor:dark?'#000':'#fff',bodyColor:dark?'#000':'#fff',padding:10,cornerRadius:8}},
      scales:{x:{stacked:true, grid:{display:false}, ticks:{font:{size:10},color:tick}, border:{display:false}}, y:{stacked:true, beginAtZero:true, grid:{color:grid,drawTicks:false}, ticks:{font:{size:10},color:tick,padding:6,callback:v=>v+'h'}, border:{display:false}}}}
  });
}
function renderLog(){
  renderLogSummary();
  renderLogChart();
  const tb = document.querySelector("#logTable tbody");
  // Sync toolbar controls to state
  const searchEl = document.getElementById("logSearch");
  const iconEl = document.getElementById("logSearchIcon");
  if (iconEl && !iconEl.innerHTML) iconEl.innerHTML = ICO.search;
  const clearEl = document.getElementById("logSearchClear");
  if (clearEl && !clearEl.innerHTML) clearEl.innerHTML = ICO.x;
  if (searchEl && document.activeElement !== searchEl && searchEl.value !== (state.logSearch||"")) searchEl.value = state.logSearch||"";
  if (clearEl) clearEl.classList.toggle("show", !!(state.logSearch||"").length);
  // Year filter, auto-populated from entries
  const years = [...new Set(state.entries.map(e => parseDate(e.date).getFullYear()))].sort((a,b) => b-a);
  if ((state.logYear||"All")!=="All" && !years.map(String).includes(String(state.logYear))) state.logYear = "All";
  const yearSel = document.getElementById("logYearFilter");
  if (yearSel){ yearSel.innerHTML = `<option value="All">All years</option>` + years.map(y => `<option value="${y}">${y}</option>`).join(""); yearSel.value = state.logYear||"All"; }
  const typeSel = document.getElementById("logTypeFilter"); if (typeSel) typeSel.value = state.logType||"All";
  const view = state.logView||"list";
  document.querySelectorAll("#logViewToggle button").forEach(b => b.classList.toggle("active", b.dataset.view === view));

  // Order from the current date, like the Friday Planner / Smart Suggestions:
  // upcoming entries first (soonest → later), then past entries (most recent → older).
  const t0 = today();
  const fromToday = (a,b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    const au = da >= t0, bu = db >= t0;
    if (au && bu) return da - db;      // both upcoming → soonest first
    if (!au && !bu) return db - da;    // both past → most recent first
    return au ? -1 : 1;                // upcoming before past
  };
  const filtered = getFilteredEntries().sort(fromToday);
  const total = state.entries.length;
  document.getElementById("logCount").textContent = logIsFiltered() ? `${filtered.length} of ${total} entries` : `${total} entries`;

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
      const collapsed = !!(state.collapsedMonths && state.collapsedMonths[k]);
      const header = `<tr class="log-group${collapsed?' collapsed':''}" onclick="toggleMonthCollapse('${k}')"><td colspan="8"><div class="log-group-head"><span class="log-group-chev">${collapsed?ICO.chevRight:ICO.chevDown}</span><span class="log-group-title">${MONTHNAMES[mm-1]} ${yy}</span><span class="log-group-stats">${items.length} ${items.length===1?"entry":"entries"} · ${totalHrs}h · ${days} ${days===1?"day":"days"}</span></div></td></tr>`;
      return header + (collapsed ? "" : items.map(logRowHtml).join(""));
    }).join("");
  } else {
    tb.innerHTML = filtered.map(logRowHtml).join("");
  }
  updateLogBulkBar();
}
function logRowHtml(e){
  const idx = state.entries.indexOf(e); const d = parseDate(e.date);
  let cls = 'a';
  if (e.type==='PTO') cls='g'; else if (e.type==='Sick') cls='r'; else if (e.type==='Personal Holiday') cls='p';
  const chk = `<td class="no-print cell-check"><input type="checkbox" class="log-check" data-idx="${idx}" ${selectedLog.has(idx)?'checked':''} onchange="onLogCheck(${idx},this.checked)" aria-label="Select entry"></td>`;
  return `<tr${selectedLog.has(idx)?' class="row-selected"':''}>${chk}<td data-label="Date"><b>${fmt(d)}</b></td><td data-label="Day" style="color:var(--n-500)">${DAYNAMES[d.getDay()]}</td><td data-label="Type"><span class="chip ${cls}">${e.type}</span></td><td data-label="Hours" class="num">${e.hours}</td><td data-label="Status"><span class="chip n">${e.status||"-"}</span></td><td data-label="Notes" style="color:var(--n-500)">${e.notes||"—"}</td><td class="cell-actions"><div style="display:flex;gap:4px;justify-content:flex-end"><button class="btn subtle sm" onclick="openEditModal(${idx})" title="Edit">${ICO.edit}</button><button class="btn subtle sm" onclick="deleteEntry(${idx})" title="Delete">${ICO.trash}</button></div></td></tr>`;
}
function onLogCheck(idx, checked){ if (checked) selectedLog.add(idx); else selectedLog.delete(idx); const tr = document.querySelector(`.log-check[data-idx="${idx}"]`)?.closest('tr'); if (tr) tr.classList.toggle('row-selected', checked); updateLogBulkBar(); }
function toggleLogSelectAll(checked){ document.querySelectorAll('#logTable .log-check').forEach(cb => { const idx = Number(cb.dataset.idx); cb.checked = checked; if (checked) selectedLog.add(idx); else selectedLog.delete(idx); cb.closest('tr').classList.toggle('row-selected', checked); }); updateLogBulkBar(); }
function updateLogBulkBar(){ const bar = document.getElementById('logBulkBar'); const cnt = document.getElementById('logBulkCount'); const n = selectedLog.size; if (bar) bar.classList.toggle('show', n>0); if (cnt) cnt.textContent = `${n} selected`; const all = document.getElementById('logSelectAll'); const boxes = document.querySelectorAll('#logTable .log-check'); if (all) all.checked = boxes.length>0 && [...boxes].every(b=>b.checked); }
function clearLogSelection(){ selectedLog.clear(); renderLog(); }
function bulkStatusLog(status){ if (!selectedLog.size) return; [...selectedLog].forEach(i => { if (state.entries[i]) state.entries[i].status = status; }); const n = selectedLog.size; selectedLog.clear(); save(); refresh(); toast(`Marked ${n} as ${status}`); }
function bulkDeleteLog(){ if (!selectedLog.size) return; const n = selectedLog.size; if (!confirm(`Delete ${n} selected ${n===1?'entry':'entries'}?`)) return; [...selectedLog].sort((a,b)=>b-a).forEach(i => { const e = state.entries[i]; if (e){ detachPH(e); state.entries.splice(i,1); } }); selectedLog.clear(); save(); refresh(); toast(`Deleted ${n} ${n===1?'entry':'entries'}`); }
function monthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function setLogView(v){ state.logView = v; save(); renderLog(); }
function toggleMonthCollapse(k){ state.collapsedMonths = state.collapsedMonths || {}; if (state.collapsedMonths[k]) delete state.collapsedMonths[k]; else state.collapsedMonths[k] = true; save(); renderLog(); }
let _logSearchTimer = null;
function onLogSearch(v){
  state.logSearch = v;
  const clearEl = document.getElementById("logSearchClear"); if (clearEl) clearEl.classList.toggle("show", !!v.length);
  if (_logSearchTimer) clearTimeout(_logSearchTimer);
  _logSearchTimer = setTimeout(() => { save(); renderLog(); }, 150);
}
function clearLogSearch(){ state.logSearch = ""; const el = document.getElementById("logSearch"); if (el){ el.value = ""; el.focus(); } save(); renderLog(); }
function onLogFilter(key, val){ state[key] = val; save(); renderLog(); }
function clearLogFilters(){ state.logSearch = ""; state.logType = "All"; state.logYear = "All"; save(); renderLog(); }

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
function dismissSugTip(){ state.sugTipDismissed = true; save(); const el = document.getElementById("sugTip"); if (el) el.style.display = "none"; }
function renderSuggestions(){
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

function renderFridays(){
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
const FRI_DEFAULT_HRS = 4;
function friHours(st){ const h = (st && st.hours != null && st.hours !== "") ? Number(st.hours) : NaN; return (h > 0) ? h : FRI_DEFAULT_HRS; }


// REDESIGNED CALENDAR with Friday appointments
function renderCalendar(){
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
function setCalMonth(m){ calCursor = new Date(calCursor.getFullYear(), Number(m), 1); renderCalendar(); }
function setCalYear(y){ calCursor = new Date(Number(y), calCursor.getMonth(), 1); renderCalendar(); }
function toggleCalList(){ state.calListCollapsed = !state.calListCollapsed; save(); applyCalListCollapsed(); }
function applyCalListCollapsed(){ const side = document.getElementById("calSide"); if (side) side.classList.toggle("collapsed", !!state.calListCollapsed); }
function calJumpDay(iso){ if (state.calListCollapsed){ state.calListCollapsed = false; save(); applyCalListCollapsed(); } flashCalDay(iso); const cell = document.querySelector(`.cal-day[data-iso="${iso}"]`); if (cell) cell.scrollIntoView({block:"nearest", behavior:"smooth"}); }
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
function toggleLegendFilter(key){
  if (!state.calFilters) state.calFilters = {};
  state.calFilters[key] = state.calFilters[key] === false ? true : false;
  save(); renderCalendar();
}
function goToToday(){
  const t = today();
  calCursor = new Date(t.getFullYear(), t.getMonth(), 1);
  renderCalendar();
  toast(`Jumped to ${MONTHNAMES[t.getMonth()]} ${t.getFullYear()}`);
}

// --- Drag entries between days to reschedule ---
// Drag payload: {type:'entry'|'fri'|'sug', key}. entry.key=index, fri/sug.key=iso date.
let _drag = null;
function dragStart(ev, type, key){
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
function dragOver(ev, iso){
  ev.preventDefault();
  const invalid = _drag && !!dropBlockReasonFor(_drag, iso);
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = invalid ? "none" : "move";
  const cell = ev.currentTarget;
  if (cell && !cell.classList.contains("empty")){
    cell.classList.remove("drop-target","drop-invalid");
    cell.classList.add(invalid ? "drop-invalid" : "drop-target");
  }
}
function dragLeave(ev){ const cell = ev.currentTarget; if (cell) cell.classList.remove("drop-target","drop-invalid"); }
function dropOnDay(ev, iso){
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

function dismissCfgTip(){ state.cfgTipDismissed = true; save(); const el = document.getElementById("cfgTip"); if (el) el.style.display = "none"; }
function renderSettings(){
  const tipEl = document.getElementById("cfgTip"); if (tipEl) tipEl.style.display = state.cfgTipDismissed ? "none" : "";
  const c = state.config;
  document.getElementById("c_name").value = c.name;
  document.getElementById("c_hire").value = c.hire;
  document.getElementById("c_year").value = c.year;
  document.getElementById("c_workday").value = c.workday;
  document.getElementById("c_birthday").value = c.birthday || "";
  document.getElementById("allotList").innerHTML = state.allotments.sort((a,b) => a.year-b.year).map((a,i) => {
    const isNA = a.sick === null;
    return `<div class="year-row"><div class="year-label">${a.year}</div><div><input type="number" value="${a.vacation}" step="0.5" onchange="updateAllot(${i},'vacation',this.value)"/></div><div class="sick-input-wrap"><input type="number" value="${isNA?'':a.sick}" step="0.5" placeholder="${isNA?'N/A':''}" ${isNA?'disabled':''} onchange="updateAllot(${i},'sick',this.value)"/><label class="na-toggle"><input type="checkbox" ${isNA?'checked':''} onchange="toggleNA(${i},this.checked)"/>N/A</label></div><div><input type="text" value="${(a.notes||'').replace(/"/g,'&quot;')}" onchange="updateAllot(${i},'notes',this.value)"/></div></div>`;
  }).join("");
  document.getElementById("holList").innerHTML = state.holidays.sort((a,b) => a.date.localeCompare(b.date)).map((h,i) => `<div style="display:flex;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line-soft)"><span style="width:140px;color:var(--n-500);font-size:13px;font-variant-numeric:tabular-nums">${fmt(parseDate(h.date))}</span><span style="flex:1;font-size:13px;color:var(--n-800);font-weight:500">${h.name}</span><button class="btn subtle sm" onclick="delHoliday(${i})">${ICO.trash}</button></div>`).join("");
  const snap = document.getElementById("cfgSnapshot");
  if (snap){
    const bal = currentBalance(); const t = today();
    const yos = yearsOfService(t); const yy = Math.floor(yos); const mm = Math.floor((yos-yy)*12);
    const nxt = nextMilestone(t);
    snap.innerHTML =
      `<div class="cfg-snap-item"><div class="cs-lbl">PTO Balance</div><div class="cs-val">${bal.toFixed(1)} hrs</div><div class="cs-sub">${(bal/c.workday).toFixed(1)} days available</div></div>` +
      `<div class="cfg-snap-item"><div class="cs-lbl">Service Tenure</div><div class="cs-val">${yy}y ${mm}m</div><div class="cs-sub">Since ${fmt(parseDate(c.hire),{month:"short",year:"numeric"})}</div></div>` +
      `<div class="cfg-snap-item"><div class="cs-lbl">Next Milestone</div><div class="cs-val">${nxt?nxt.label:"Max"}</div><div class="cs-sub">${nxt?nxt.daysUntil+" days · "+nxt.vacDays+" days/yr":"Top tier"}</div></div>`;
  }
}

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
function detachPH(entry){
  if (entry && entry.type === "Personal Holiday"){
    const ph = state.personalHolidays.find(p => p.date === entry.date);
    if (ph){ ph.date = null; ph.status = "Unscheduled"; ph.notes = ""; }
  }
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
  save(); calCursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1); refresh();
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
function globalSearchGo(v){ state.logSearch = v || ""; save(); switchTab("log"); renderLog(); const el = document.getElementById("logSearch"); if (el) el.value = v || ""; }
function requestTimeOff(){ switchTab("log"); const card = document.querySelector("#log .card.no-print"); if (card) card.scrollIntoView({behavior:"smooth", block:"center"}); const t = document.getElementById("e_type"); if (t) setTimeout(()=>t.focus(), 200); }
function viewInCalendar(iso){ const d = parseDate(iso); calCursor = new Date(d.getFullYear(), d.getMonth(), 1); renderCalendar(); switchTab("cal"); }
function navMonth(n){ calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()+n, 1); renderCalendar(); }
function updateFri(iso, field, val){ state.fridays = state.fridays||{}; state.fridays[iso] = state.fridays[iso]||{purpose:"",status:"Open"}; state.fridays[iso][field] = val; save(); renderCalendar(); renderUpcomingFridays(); renderFridays(); }
function toggleFriShowAll(){ state.friShowAll = !state.friShowAll; save(); renderFridays(); }
function updateAllot(i, field, val){ const sorted = [...state.allotments].sort((a,b) => a.year-b.year); const target = sorted[i]; const idx = state.allotments.indexOf(target); state.allotments[idx][field] = field==="notes" ? val : Number(val); save(); }
function toggleNA(i, checked){ const sorted = [...state.allotments].sort((a,b) => a.year-b.year); const target = sorted[i]; const idx = state.allotments.indexOf(target); state.allotments[idx].sick = checked ? null : 0; save(); refresh(); toast(checked?"Marked as N/A":"N/A removed"); }
function saveConfig(){ const c = state.config; c.name = document.getElementById("c_name").value; c.hire = document.getElementById("c_hire").value; c.year = Number(document.getElementById("c_year").value); c.workday = Number(document.getElementById("c_workday").value); c.birthday = document.getElementById("c_birthday").value; save(); refresh(); toast("Settings saved"); }
function addHoliday(){ const d = document.getElementById("new_hol_date").value; const n = document.getElementById("new_hol_name").value; if (!d||!n){ toast("Enter date and name"); return; } state.holidays.push({date:d, name:n}); save(); document.getElementById("new_hol_date").value=""; document.getElementById("new_hol_name").value=""; renderSettings(); refresh(); toast("Holiday added"); }
function delHoliday(i){ const sorted = [...state.holidays].sort((a,b) => a.date.localeCompare(b.date)); const target = sorted[i]; state.holidays = state.holidays.filter(h => h!==target); save(); renderSettings(); refresh(); toast("Holiday removed"); }
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
document.addEventListener('dragend', () => {
  document.querySelectorAll('.cal-tag.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.cal-day.drop-target,.cal-day.drop-invalid').forEach(el => el.classList.remove('drop-target','drop-invalid'));
  _drag = null;
});

dpSet("e_date", isoDate(today()));
calCursor = new Date(state.config.year, today().getMonth(), 1);
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
  getThemeMode, resolveTheme, getTheme, setTheme, updateThemeToggle, openNav, closeNav, toggleNav, toggleSidebarSmart, toggleSidebar, updateSidebarToggleA11y, scheduledFridayAppts, toggleSugFilter, renderGreeting, renderKPIs, dashDrillLog, dashDrillLogYear, drillFriday, setChartRange, renderPersonalHolidayStrip, schedulePersonalHoliday, unschedulePersonalHoliday, markPersonalHolidayTaken, renderCharts, renderInsights, notifUnreadCount, refreshNotifDot, notifTabFor, activeNotifs, renderNotifPanel, dismissNotif, toggleNotifPanel, closeNotifPanel, markAllNotifsRead, toggleUserMenu, closeUserMenu, openNotif, dismissInsight, restoreInsight, toggleShowDismissed, dismissAllInsights, renderUpcoming, renderHistory, renderUpcomingFridays, logIsFiltered, parseLogQuery, getFilteredEntries, renderLogSummary, renderLogChart, renderLog, logRowHtml, onLogCheck, toggleLogSelectAll, updateLogBulkBar, clearLogSelection, bulkStatusLog, bulkDeleteLog, monthKey, setLogView, toggleMonthCollapse, onLogSearch, clearLogSearch, onLogFilter, clearLogFilters, openEditModal, closeEditModal, saveEditEntry, renderSugSummary, dismissSugTip, renderSuggestions, renderFridays, friHours, renderAnniversaries, updateTier, renderCalendar, syncCalPickers, setCalMonth, setCalYear, toggleCalList, applyCalListCollapsed, calJumpDay, renderCalSide, renderCalInsights, renderCalEvents, renderCalStats, flashCalDay, updateLegendUI, toggleLegendFilter, goToToday, dragStart, dropBlockReasonFor, dragOver, dragLeave, dropOnDay, moveFridayAppt, bookSuggestionAt, rescheduleEntry, dpSet, dpDisabled, openDatePicker, closeDatePicker, datePickerOpen, positionDatePicker, dpMonth, dpToday, renderDatePicker, dpSelect, dismissCfgTip, renderSettings, uid, businessDaysInRange, setAllDay, updateEntryFormUI, updateRangePreview, addEntry, detachPH, deleteEntry, bookSuggestion, switchTab, globalSearchGo, requestTimeOff, viewInCalendar, navMonth, updateFri, toggleFriShowAll, updateAllot, toggleNA, saveConfig, addHoliday, delHoliday, exportData, exportICS, exportCSV, exportExcel, loadXLSX, finishSpreadsheetImport, importSpreadsheet, importData, resetAll, refresh, pwaStandalone, pwaIsIOS, pwaDismissed, showPwaBanner, hidePwaBanner, dismissPwaBanner, installPwa
});
