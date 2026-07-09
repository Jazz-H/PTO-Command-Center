/* Insights engine: turns the current state into prioritized insight cards.
   View-model layer — pulls from the domain modules and emits insight objects
   (icon + HTML body + optional action) plus their HTML. The render/DOM wiring
   lives in app.ts; this module just computes and formats. */
import { state } from "../state/store.ts";
import { today, parseDate, fmt, isoDate, addDays, daysBetween } from "../domain/dates.ts";
import { currentBalance, getAllotment, daysUntilNextRefill, ytdUsage, holidayName } from "../domain/balance.ts";
import { nextMilestone } from "../domain/anniversaries.ts";
import { buildSuggestions } from "../domain/suggestions.ts";
import { getPersonalHoliday, isEligibleForPH } from "../domain/personalholiday.ts";
import { ICO } from "./icons.ts";

export function buildInsights(){
  const cfg = state.config; const t = today(); const y = cfg.year; const wd = cfg.workday || 8;
  const bal = currentBalance(); const allot = getAllotment(y); const nextAllot = getAllotment(y+1);
  const daysToRefill = daysUntilNextRefill(); const ins = [];
  const D = h => (h/wd);
  // Forecasting: hours booked this year (incl. future) vs allotment -> what will forfeit
  const vacUsedAll = ytdUsage("PTO", y);
  const atRiskHrs = Math.max(0, allot.vacation - vacUsedAll);
  const atRiskDays = D(atRiskHrs);
  const monthsLeft = Math.max(1, daysToRefill/30.44);
  const perMonth = atRiskDays/monthsLeft;
  const dated = state.entries.map(e => ({...e, d:parseDate(e.date)}));
  const futureOff = dated.filter(e => e.d > t && e.d.getFullYear()===y).sort((a,b)=>+a.d - +b.d);
  const nextOff = futureOff[0];
  const pastVac = dated.filter(e => e.d <= t && e.type==="PTO").sort((a,b)=>+b.d - +a.d)[0];

  // ── Vacation forfeiture (highest value) ──
  if (atRiskHrs > 0 && daysToRefill <= 45){
    ins.push({t:"critical", priority:1, icon:ICO.warn, h:"Use-it-or-lose-it alert",
      b:`<b>${atRiskDays.toFixed(1)} day${atRiskDays>=2?"s":""} (${atRiskHrs.toFixed(0)} hrs)</b> of PTO are still unbooked and forfeit on <b>Dec 31</b> — only ${daysToRefill} days left.`,
      action:{label:"Plan them", fn:"switchTab('sug')"}});
  } else if (atRiskHrs > 0 && daysToRefill <= 170){
    ins.push({t:"warn", priority:3, icon:ICO.warn, h:"Unbooked PTO will forfeit",
      b:`<b>${atRiskDays.toFixed(1)} days (${atRiskHrs.toFixed(0)} hrs)</b> aren't planned yet. PTO doesn't roll over — pacing <b>~${perMonth.toFixed(1)} day${perMonth>=1.05?"s":""}/month</b> uses it all by Dec 31.`,
      action:{label:"See suggestions", fn:"switchTab('sug')"}});
  } else if (atRiskHrs <= 0 && allot.vacation > 0){
    ins.push({t:"good", priority:6, icon:ICO.check, h:"PTO fully planned",
      b:`Every one of your <b>${D(allot.vacation).toFixed(0)} days</b> for ${y} is booked or used — nothing will be forfeited. Nice.`});
  }
  // ── Next / recent time off ──
  if (nextOff){
    const dd = daysBetween(t, nextOff.d);
    ins.push({t:"info", priority:5, icon:ICO.calendar, h:"Next time off",
      b:`<b>${nextOff.type}</b> on <b>${fmt(nextOff.d,{weekday:"long",month:"short",day:"numeric"})}</b> — ${dd===0?"today":dd===1?"tomorrow":"in "+dd+" days"}.`,
      action:{label:"Calendar", fn:`viewInCalendar('${nextOff.date}')`}});
  } else if (bal > 0){
    ins.push({t:"warn", priority:4, icon:ICO.calendar, h:"Nothing on the calendar",
      b:`You have no upcoming time off booked but <b>${D(bal).toFixed(1)} days</b> available. A long weekend does wonders.`,
      action:{label:"Find a break", fn:"switchTab('sug')"}});
  }
  if (pastVac){ const since = daysBetween(pastVac.d, t); if (since >= 45) ins.push({t:"info", priority:5, icon:ICO.clock, h:"It's been a while", b:`<b>${since} days</b> since your last PTO day (${fmt(pastVac.d,{month:"short",day:"numeric"})}). Time to recharge?`, action:{label:"Plan one", fn:"switchTab('sug')"}}); }
  // ── Top recommendation (book directly) ──
  const sug = buildSuggestions(y); const booked = new Set(state.entries.map(e => e.date));
  const openSug = sug.filter(s => !s.takeOn.every(d => booked.has(isoDate(d))));
  if (openSug.length){ const best = openSug[0]; ins.push({t:"good", priority:4, icon:ICO.star, h:"Top recommendation",
    b:`Take <b>${fmt(best.takeOn[0],{weekday:"long",month:"short",day:"numeric"})}</b> off around ${best.holiday}. ${best.result}.`,
    action:{label:"Book it", fn:`bookSuggestion(${JSON.stringify(best.takeOn.map(isoDate)).replace(/"/g,"'")})`}}); }
  // ── Personal holiday ──
  const ph = getPersonalHoliday(y); const elig = isEligibleForPH();
  if (!elig.eligible){ ins.push({t:"info", priority:6, icon:ICO.gift, h:"Personal holiday not yet available", b:`You're eligible on <b>${fmt(elig.eligibleOn,{month:"long",day:"numeric"})}</b> (90 days of service).`}); }
  else if (ph.status === "Unscheduled" && daysToRefill < 150){ ins.push({t:"warn", priority:2, icon:ICO.gift, h:"Personal holiday unscheduled", b:`Your <b>1 personal holiday</b> for ${y} isn't scheduled — <b>${daysToRefill} days</b> until it forfeits.`, action:{label:"Schedule", fn:"switchTab('dash')"}}); }
  else if (ph.status === "Scheduled" && ph.date){ ins.push({t:"good", priority:7, icon:ICO.gift, h:"Personal holiday scheduled", b:`Set for <b>${fmt(parseDate(ph.date),{weekday:"long",month:"long",day:"numeric"})}</b>.`, action:{label:"View", fn:`viewInCalendar('${ph.date}')`}}); }
  // ── Sick balance ──
  if (allot.sick === null){ ins.push({t:"info", priority:6, icon:ICO.info, h:"Sick allotment: N/A", b:"Set to <b>N/A</b> until you confirm the accrual amount with HR.", action:{label:"Set in Settings", fn:"switchTab('cfg')"}}); }
  else { const su = ytdUsage("Sick", y); const sb = allot.sick - su; if (allot.sick>0){ const pct = Math.round(su/allot.sick*100); ins.push({t:"info", priority:7, icon:ICO.sick, h:"Sick balance", b:`Used <b>${su.toFixed(0)} of ${allot.sick} hrs</b> (${pct}%) — <b>${D(sb).toFixed(1)} days</b> left this year.`}); } }
  // ── Pending approvals ──
  const pending = state.entries.filter(e => (e.status||"")==="Pending" && parseDate(e.date).getFullYear()===y);
  if (pending.length){ ins.push({t:"warn", priority:5, icon:ICO.clock, h:`${pending.length} ${pending.length===1?"entry":"entries"} pending`, b:`${pending.length} request${pending.length===1?" is":"s are"} still marked <b>Pending</b> — confirm the status once approved.`, action:{label:"Review log", fn:"switchTab('log')"}}); }
  // ── WFH Friday value ──
  let openFri = 0, apptFri = 0; { let d = new Date(t); while (d.getDay()!==5) d = addDays(d,1); const eoy = new Date(y,11,31); const sf = state.fridays||{}; while (d <= eoy){ const it = sf[isoDate(d)]; const hol = holidayName(d); if (it && it.purpose && it.status!=="Cancelled") apptFri++; else if (!hol) openFri++; d = addDays(d,7); } }
  if (openFri > 0 && apptFri === 0){ ins.push({t:"info", priority:6, icon:ICO.coffee, h:"WFH Fridays go unused", b:`<b>${openFri} work-from-home Friday${openFri===1?"":"s"}</b> left this year — book appointments/errands then to <b>save your PTO</b> for real trips.`, action:{label:"Plan Fridays", fn:"switchTab('fri')"}}); }
  // ── Refill + bump ──
  if (nextAllot.vacation > allot.vacation){ const bump = nextAllot.vacation - allot.vacation; ins.push({t:"good", priority:5, icon:ICO.celebrate, h:"PTO bump coming", b:`On Jan 1, ${y+1} you'll receive <b>${nextAllot.vacation} hrs (${D(nextAllot.vacation).toFixed(0)} days)</b> — an extra ${D(bump).toFixed(0)} days.`}); }
  ins.push({t:"info", priority:8, icon:ICO.refill, h:"Next PTO refill", b:`January 1, ${y+1} · <b>${daysToRefill} days</b> away · +${nextAllot.vacation} hrs incoming.`});
  // ── Milestone ──
  const nxt = nextMilestone();
  if (nxt && nxt.daysUntil <= 150){ ins.push({t:"good", priority:5, icon:ICO.award, h:`${nxt.label} milestone approaching`, b:`<b>${nxt.daysUntil} days</b> until ${fmt(nxt.date)} — PTO rises to <b>${nxt.vacDays} days/year</b>.`, action:{label:"View", fn:"switchTab('ann')"}}); }
  ins.sort((a,b) => (a.priority||9) - (b.priority||9));
  return ins;
}

function hashStr(s){ let h=0; for (let k=0;k<s.length;k++){ h=(h*31 + s.charCodeAt(k))|0; } return (h>>>0).toString(36); }
export function insightId(i){ return "i"+hashStr(i.t+"|"+i.h); }
export function insightHtml(i, isDismissed){
  const btn = isDismissed
    ? `<button class="insight-dismiss" onclick="restoreInsight('${i.id}')" title="Restore insight" aria-label="Restore insight">${ICO.refill}</button>`
    : (i.dismissable ? `<button class="insight-dismiss" onclick="dismissInsight('${i.id}')" title="Dismiss insight" aria-label="Dismiss insight">${ICO.x}</button>` : "");
  const act = (i.action && !isDismissed) ? `<div class="insight-actions"><button class="btn ghost sm" onclick="event.stopPropagation();${i.action.fn}">${i.action.label} →</button></div>` : "";
  return `<div class="insight ${i.t}${isDismissed?" dismissed":""}"><div class="insight-icon">${i.icon}</div><div class="insight-body"><strong>${i.h}</strong>${i.b}${act}</div>${btn}</div>`;
}
export const DASH_INSIGHT_MAX = 4;
// Split insights by type across the two surfaces so nothing shows twice:
//   notifications (bell) = alerts that need attention (critical / warn)
//   dashboard Insights   = recommendations & info (good / info), capped at 4
const NOTIF_TYPES = ["critical", "warn"];
export function isNotifType(t){ return NOTIF_TYPES.indexOf(t) !== -1; }
// All non-dismissed insights, sorted by priority (buildInsights already sorts).
export function liveInsights(){
  const dismissed = new Set(state.dismissedInsights || []);
  return buildInsights().map(i => ({...i, id: insightId(i), dismissable: i.t !== "critical"}))
    .filter(i => !(i.dismissable && dismissed.has(i.id)));
}
