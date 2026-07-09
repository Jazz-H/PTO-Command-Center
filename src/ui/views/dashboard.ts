/* Dashboard view — greeting, the five KPI cards, the balance/usage charts,
   the personal-holiday KPI actions, and the upcoming / history / upcoming-Fridays
   lists. Reads several domains; mutations persist via save() and repaint through
   the refresh() seam. Tab jumps go through the switchTab() seam. Owns the two
   dashboard chart handles. Inline handlers (dashDrillLog, viewInCalendar,
   schedulePersonalHoliday, …) resolve through the window bridge. */
import { state, save } from "../../state/store.ts";
import { refresh } from "../refresh.ts";
import { switchTab } from "../nav.ts";
import { today, fmt, parseDate, isoDate, addDays, daysBetween, isWeekend, MONTHNAMES } from "../../domain/dates.ts";
import { currentBalance, ytdUsage, getAllotment, daysUntilNextRefill, isHoliday, holidayName } from "../../domain/balance.ts";
import { getPersonalHoliday, isEligibleForPH, reconcilePersonalHolidays } from "../../domain/personalholiday.ts";
import { nextMilestone } from "../../domain/anniversaries.ts";
import { buildChartData, usageThisVsLast, vacCumulativeByMonth } from "../../domain/charts.ts";
import { gotoCalendarMonth } from "./calendar.ts";
import { toast, cssVar, esc, ringSVG2, sparklineSVG, $ } from "../dom.ts";
import { ICO } from "../icons.ts";

let balChart, pieChart;
// Resize the dashboard charts after a layout change (e.g. the sidebar toggling).
export function resizeCharts(){ if (balChart && balChart.resize) balChart.resize(); if (pieChart && pieChart.resize) pieChart.resize(); }

export function renderGreeting(){
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const first = (state.config.name || "there").split(" ")[0];
  const g = $("dashGreeting"); if (g) g.innerHTML = `Good ${part}, ${first}! <span style="font-weight:400">👋</span>`;
  const s = $("dash-sub"); if (s) s.textContent = `Here's your time-off overview for ${fmt(today(),{weekday:"long",month:"long",day:"numeric",year:"numeric"})}`;
  applyIdentity();
}

// Paint the signed-in user's name + initials into the shell (sidebar card, top
// chip, account menu). No PII is baked into the markup — it all comes from
// config.name, so every account sees only its own identity.
function applyIdentity(){
  const name = (state.config.name || "").trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "—";
  document.querySelectorAll<HTMLElement>(".uc-avatar, .user-card .avatar").forEach(el => el.textContent = initials);
  document.querySelectorAll<HTMLElement>(".uc-name, .user-info .n, #umName").forEach(el => el.textContent = name || "Your profile");
}
export function renderKPIs(){
  const cfg = state.config; const bal = currentBalance();
  const uv = ytdUsage("PTO", cfg.year); const us = ytdUsage("Sick", cfg.year);
  const allot = getAllotment(cfg.year); const daysToRefill = daysUntilNextRefill();
  const sickIsNA = allot.sick === null;
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

  $("kpis").innerHTML = `
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
          <div class="kpi-top"><div class="kpi-icon blue">${ICO.sick}</div><span class="kpi-title">Sick Used YTD</span></div>
          <div class="kpi-body"><div class="kpi-main"><div class="kpi-value v-blue">${us.toFixed(1)}<span class="unit">hrs</span></div><div class="kpi-sub">${(us/cfg.workday).toFixed(1)} days used · allotment N/A</div></div></div>
          <div class="kpi-foot">Confirm accrual with HR</div>
        </div>`
      : `<div class="kpi kpi-link" ${link("dashDrillLog('Sick')","View sick entries")}>
          <div class="kpi-top"><div class="kpi-icon blue">${ICO.sick}</div><span class="kpi-title">Sick Used YTD</span></div>
          <div class="kpi-body"><div class="kpi-main"><div class="kpi-value v-blue">${us.toFixed(1)}<span class="unit">hrs</span></div><div class="kpi-sub">${(us/cfg.workday).toFixed(1)} days of ${allot.sick} hrs</div></div></div>
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
export function setChartRange(m){ state.chartRange = m; save(); document.querySelectorAll<HTMLElement>("#rangeToggle button").forEach(b => b.classList.toggle("active", Number(b.dataset.range) === m)); renderCharts(); }

export function renderPersonalHolidayStrip(){
  const el = $("phStrip");
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

export function schedulePersonalHoliday(year){
  const input = $(`ph_date_${year}`);
  if (!input || !input.value){ toast("Pick a date first"); return; }
  const d = input.value; const parsed = parseDate(d);
  if (parsed.getFullYear() !== year){ toast("Date must be in " + year); return; }
  if (isWeekend(parsed)){ toast("Pick a weekday"); return; }
  if (isHoliday(parsed)){ toast("That's already a company holiday"); return; }
  const ph = getPersonalHoliday(year);
  ph.date = d; ph.status = "Scheduled"; ph.notes = "Personal holiday (CCCI benefit)";
  if (!state.entries.find(e => e.date === d && e.type === "Personal Holiday")){
    state.entries.push({date:d, type:"Personal Holiday", hours:state.config.workday, status:"Scheduled", notes:"CCCI personal holiday"});
  }
  save(); gotoCalendarMonth(parsed); refresh();
  toast(`Personal holiday scheduled — ${fmt(parsed,{weekday:"short",month:"short",day:"numeric"})}`);
  switchTab("cal");
}
export function unschedulePersonalHoliday(year){
  if (!confirm("Remove the scheduled personal holiday? This will also delete the log entry.")) return;
  const ph = getPersonalHoliday(year); const dateToRemove = ph.date;
  ph.date = null; ph.status = "Unscheduled"; ph.notes = "";
  if (dateToRemove) state.entries = state.entries.filter(e => !(e.date === dateToRemove && e.type === "Personal Holiday"));
  save(); refresh(); toast("Personal holiday unscheduled");
}
export function markPersonalHolidayTaken(year){
  const ph = getPersonalHoliday(year); ph.status = "Taken";
  const entry = state.entries.find(e => e.date === ph.date && e.type === "Personal Holiday");
  if (entry) entry.status = "Taken";
  save(); refresh(); toast("Marked as taken");
}

export function renderCharts(){
  const points = buildChartData(); const cfg = state.config; const dark = document.documentElement.getAttribute('data-theme')==='dark';
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
  $("chartSummary").innerHTML = `
    <div class="chart-stat balance"><span class="lbl">Current balance</span><span class="val">${bal.toFixed(0)}<span class="unit">hrs</span></span></div>
    <div class="chart-stat usage"><span class="lbl">Used YTD</span><span class="val">${usedYTDCurrent.toFixed(0)}<span class="unit">hrs</span></span></div>
    <div class="chart-stat refill"><span class="lbl">Next refill</span><span class="val">+${nextAllot.vacation}<span class="unit">hrs · Jan 1</span></span></div>
    <div class="chart-stat until"><span class="lbl">Until refill</span><span class="val">${daysToRefill}<span class="unit">days</span></span></div>`;
  const annotations = {};
  yearBoundaries.forEach((yb, i) => {
    annotations['year_' + i] = { type: 'line', xMin: yb.index, xMax: yb.index, borderColor: dark ? 'rgba(115,115,115,.4)' : 'rgba(100,116,139,.35)', borderWidth: 1, borderDash: [4, 4], label: { display: true, content: `Jan 1 ${yb.year}`, position: 'start', backgroundColor: dark ? '#1a1a1a' : '#F8FAFC', color: dark ? '#e5e5e5' : '#334155', font: {size: 10, weight: 600}, padding: {x:6,y:3}, borderRadius: 4, yAdjust: -6 } };
  });
  if (balChart) balChart.destroy();
  balChart = new Chart($("balChart"), {
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
  pieChart = new Chart($("pieChart"), {
    type:"doughnut",
    data:{labels:["PTO used","Sick used","Personal Holiday","PTO remaining"], datasets:[{data:[uv,us,uph,rem], backgroundColor:donutColors, borderWidth:2, borderColor:donutBorder}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:"70%", plugins:{legend:{display:false}, tooltip:{backgroundColor:tooltipBg, titleColor:tooltipText, bodyColor:tooltipText, padding:10, cornerRadius:8}}}
  });
  // Center label + custom legend
  const donutWrap = document.querySelector(".usage-donut");
  if (donutWrap){ let ctr = donutWrap.querySelector(".donut-center"); if (!ctr){ ctr = document.createElement("div"); ctr.className = "donut-center"; donutWrap.appendChild(ctr); } ctr.innerHTML = `<span class="dc-val">${totalUsed.toFixed(1)}</span><span class="dc-lbl">hrs used</span>`; }
  const legEl = $("usageLegend");
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

export function renderUpcoming(){
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
  if (!up.length){ $("upcoming").innerHTML = `<div class="empty"><div class="empty-icon">${ICO.calendar}</div><h4>Nothing scheduled</h4><p>A good week to plan a trip.</p></div>`; return; }
  $("upcoming").innerHTML = `<div class="up-list">` + up.map(e => {
    const onclick = e.fri ? `drillFriday('${e.date}')` : `viewInCalendar('${e.date}')`;
    return `<div class="up-row" onclick="${onclick}"><span class="up-dot ${e.dot}"></span><span class="up-date">${fmt(e.d,{weekday:"short",month:"short",day:"numeric"})}</span><span class="up-label">${e.label}</span><span class="up-right">${e.right}</span></div>`;
  }).join("") + `</div><a class="up-viewall" onclick="switchTab('cal')">View all →</a>`;
}
export function renderHistory(){
  const el = $("history"); if (!el) return;
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
export function renderUpcomingFridays(){
  const el = $("upcomingFridays"); if (!el) return;
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
