/* Smart-suggestion engine: finds high-ROI PTO placements around holidays.
   Pure domain — reads state, uses date + balance helpers. */
import { state } from "../state/store.ts";
import { isoDate, isWeekend, addDays, DAYNAMES, parseDate, today, fmt } from "./dates.ts";
import { isHoliday, currentBalance } from "./balance.ts";

export function buildSuggestions(year){
  const workday = state.config.workday || 8; const out = [];
  state.holidays.forEach(h => {
    const d = parseDate(h.date); if (d.getFullYear() !== year) return;
    const w = d.getDay(); let take=[], desc="", roi=0;
    if (w===1){ take=[addDays(d,1)]; desc="Sat–Tue off (4-day weekend)"; roi=4; }
    else if (w===2){ take=[addDays(d,-1)]; desc="Sat–Tue off (4-day weekend)"; roi=4; }
    else if (w===3){ take=[addDays(d,1)]; desc="Thu PTO + Fri WFH = 5 days off"; roi=5; }
    else if (w===4){ take=[addDays(d,-1)]; desc="Wed PTO + Fri WFH = 5 days off"; roi=5; }
    else if (w===5){ take=[addDays(d,-1)]; desc="Thu–Sun off (4-day weekend)"; roi=4; }
    else return;
    if (take.some(t => isWeekend(t) || isHoliday(t))) return;
    out.push({holiday:h.name, hDate:d, hDay:DAYNAMES[w], takeOn:take, result:desc, hours:workday*take.length, roi});
  });
  out.sort((a,b) => b.roi - a.roi || a.hDate - b.hDate);
  return out;
}
export function suggestedDates(){ return new Set(buildSuggestions(state.config.year).flatMap(s => s.takeOn.map(d => isoDate(d)))); }

export function nthWeekday(year, month, weekday, n){
  if (n > 0){ let d = new Date(year, month, 1), count = 0; while (true){ if (d.getDay() === weekday){ count++; if (count === n) return d; } d = addDays(d, 1); } }
  let d = new Date(year, month + 1, 0); while (d.getDay() !== weekday) d = addDays(d, -1); return d;
}
export function usFederalHolidays(year){
  return [
    {name:"New Year's Day", d:new Date(year,0,1)},
    {name:"MLK Day", d:nthWeekday(year,0,1,3)},
    {name:"Presidents' Day", d:nthWeekday(year,1,1,3)},
    {name:"Memorial Day", d:nthWeekday(year,4,1,-1)},
    {name:"Juneteenth", d:new Date(year,5,19)},
    {name:"Independence Day", d:new Date(year,6,4)},
    {name:"Labor Day", d:nthWeekday(year,8,1,1)},
    {name:"Columbus Day", d:nthWeekday(year,9,1,2)},
    {name:"Veterans Day", d:new Date(year,10,11)},
    {name:"Thanksgiving", d:nthWeekday(year,10,4,4)},
    {name:"Christmas Day", d:new Date(year,11,25)}
  ];
}
// Longest consecutive run of "off" days (weekend / company holiday / WFH-Friday / a PTO day) covering the first PTO date
export function ptoOffSpan(dates){
  if (!dates.length) return 0;
  const pto = new Set(dates.map(isoDate));
  const flex = x => isWeekend(x) || isHoliday(x) || x.getDay() === 5 || pto.has(isoDate(x));
  const seed = dates[0];
  let start = new Date(seed), end = new Date(seed);
  while (flex(addDays(start,-1))) start = addDays(start,-1);
  while (flex(addDays(end,1))) end = addDays(end,1);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
export function buildAllSuggestions(year){
  const wd = state.config.workday || 8, t = today(), out = [];
  const booked = new Set(state.entries.map(e => e.date));
  // S1 — company holiday bridges (reuse existing engine)
  buildSuggestions(year).forEach(s => out.push({category:"company", occasion:s.holiday, date:s.hDate, dayName:s.hDay, takeOn:s.takeOn, result:s.result, hours:s.hours, roi:s.roi, reason:`Adjacent to the ${s.holiday} company holiday — your WFH Friday stretches it further.`, bookable:true}));
  // S2 — federal holidays CCCI doesn't observe
  const ccci = new Set(state.holidays.map(h => h.date));
  usFederalHolidays(year).forEach(f => {
    const iso = isoDate(f.d), w = f.d.getDay();
    if (ccci.has(iso) || f.d < t || isWeekend(f.d) || w === 5) return;
    const span = ptoOffSpan([f.d]); if (span < 3) return;
    out.push({category:"federal", occasion:f.name, date:new Date(f.d), dayName:DAYNAMES[w], takeOn:[new Date(f.d)], result:`${span} days off (incl. WFH Fri + weekend)`, hours:wd, roi:span, reason:`${f.name} is a US federal holiday CCCI doesn't observe — one PTO day here makes a long weekend.`, bookable:true});
  });
  // S3 — adjacent-weekend extensions (one Monday per month, up to 6)
  { let d = new Date(t); while (d.getDay() !== 1) d = addDays(d,1); const months = new Set(); let n = 0; const endY = new Date(year,11,31);
    while (d <= endY && n < 6){ const iso = isoDate(d), mk = d.getFullYear()+"-"+d.getMonth();
      if (!isWeekend(d) && !isHoliday(d) && !booked.has(iso) && !months.has(mk)){
        const span = ptoOffSpan([d]);
        if (span >= 3){ out.push({category:"weekend", occasion:`Weekend of ${fmt(addDays(d,-2),{month:"short",day:"numeric"})}`, date:new Date(d), dayName:"Monday", takeOn:[new Date(d)], result:`${span}-day weekend`, hours:wd, roi:span, reason:"Take the Monday to turn an ordinary weekend into a long one — your WFH Friday helps.", bookable:true}); months.add(mk); n++; }
      }
      d = addDays(d,7);
    }
  }
  // S4 — personal anchors (birthday + work anniversary)
  const anchors = [];
  const bd = (state.config.birthday||"").trim();
  if (bd){ const parts = bd.split("-").map(Number); const mm = parts[parts.length-2], dd = parts[parts.length-1]; if (mm && dd) anchors.push({name:"Your birthday 🎂", d:new Date(year, mm-1, dd)}); }
  { const h = parseDate(state.config.hire); const yrs = year - h.getFullYear(); if (yrs > 0) anchors.push({name:`Work anniversary · ${yrs} yr`, d:new Date(year, h.getMonth(), h.getDate())}); }
  anchors.forEach(a => { if (a.d < t || isWeekend(a.d) || isHoliday(a.d) || booked.has(isoDate(a.d))) return;
    const span = ptoOffSpan([a.d]);
    out.push({category:"personal", occasion:a.name, date:new Date(a.d), dayName:DAYNAMES[a.d.getDay()], takeOn:[new Date(a.d)], result: span >= 3 ? `${span}-day break` : "A day for you", hours:wd, roi:span, reason:`${a.name} falls on a ${fmt(a.d,{weekday:"long"})} this year — take it off.`, bookable:true});
  });
  // S5 — balance plan (informational)
  { const bal = currentBalance(); const daysLeft = bal / wd; const mLeft = Math.max(1, 12 - t.getMonth());
    if (daysLeft >= 1){ out.push({category:"balance", occasion:"Use your remaining balance", date:null, dayName:"", takeOn:[], result:`${daysLeft.toFixed(1)} days over ~${mLeft} mo (≈${(daysLeft/mLeft).toFixed(1)}/mo)`, hours:bal, roi:Math.round(daysLeft), reason:"PTO doesn't roll over on Dec 31 — spread the rest across the remaining months so you don't forfeit any.", bookable:false}); }
  }
  return out;
}
