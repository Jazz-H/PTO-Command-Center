/* Chart & KPI data shaping — pure functions that turn entries + allotments
   into the series the dashboard charts and sparklines consume. No DOM, no
   Chart.js: the render layer in app.ts feeds these into the canvases. */
import { state } from "../state/store.ts";
import { today, parseDate, MONTHNAMES } from "./dates.ts";
import { getAllotment } from "./balance.ts";

// 15-month rolling PTO balance / usage series starting from the current month.
export function buildChartData(){
  const t = today();
  const startYear = t.getFullYear(); const startMonth = t.getMonth();
  const points = [];
  for (let i = 0; i < 15; i++){
    const monthDate = new Date(startYear, startMonth + i, 1);
    const yr = monthDate.getFullYear(); const mo = monthDate.getMonth();
    const monthEnd = new Date(yr, mo + 1, 0);
    const monthStart = new Date(yr, mo, 1);
    const allot = getAllotment(yr);
    const usedThisMonth = state.entries.filter(e => e.type === "PTO" && e.status!=="Cancelled" && parseDate(e.date) >= monthStart && parseDate(e.date) <= monthEnd).reduce((s,e) => s + Number(e.hours||0), 0);
    const usedToDate = state.entries.filter(e => e.type === "PTO" && e.status!=="Cancelled" && parseDate(e.date).getFullYear() === yr && parseDate(e.date) <= monthEnd).reduce((s,e) => s + Number(e.hours||0), 0);
    points.push({label: `${MONTHNAMES[mo].slice(0,3)} '${String(yr).slice(2)}`, shortLabel: MONTHNAMES[mo].slice(0,3), balance: Math.max(0, allot.vacation - usedToDate), usedYTD: usedToDate, usedThisMonth, monthDate, year: yr, month: mo, allotment: allot.vacation});
  }
  return points;
}

// PTO hours used this month vs last month (for the KPI delta).
export function usageThisVsLast(){
  const t = today(), y = t.getFullYear(), m = t.getMonth();
  const inMonth = (yy,mm) => state.entries.filter(e => e.type==="PTO" && e.status!=="Cancelled" && parseDate(e.date).getFullYear()===yy && parseDate(e.date).getMonth()===mm).reduce((s,e)=>s+Number(e.hours||0),0);
  const cur = inMonth(y,m); const last = m===0 ? inMonth(y-1,11) : inMonth(y,m-1);
  return { cur, last, diff: cur-last };
}

// Cumulative PTO hours by month for the current year (drives the KPI sparkline).
export function vacCumulativeByMonth(year){
  const out = []; let run = 0;
  const t = today(); const upto = (t.getFullYear()===year) ? t.getMonth() : 11;
  for (let mo=0; mo<=upto; mo++){
    run += state.entries.filter(e => e.type==="PTO" && e.status!=="Cancelled" && parseDate(e.date).getFullYear()===year && parseDate(e.date).getMonth()===mo).reduce((s,e)=>s+Number(e.hours||0),0);
    out.push(run);
  }
  return out.length >= 2 ? out : [0, run];
}
