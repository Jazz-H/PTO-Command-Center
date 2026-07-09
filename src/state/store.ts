/* App state store — the persisted model plus load / save / migrate.
   `state` is a live-binding export: read it directly, mutate its fields,
   but only ever REPLACE the whole object through setState(). */
import type { AppState } from "./schema.ts";

const CCCI_2026_HOLIDAYS = [
  {date:"2026-01-01", name:"New Year's Day"},{date:"2026-01-19", name:"Martin Luther King Day"},
  {date:"2026-04-03", name:"Good Friday"},{date:"2026-05-25", name:"Memorial Day"},
  {date:"2026-07-03", name:"Independence Day"},{date:"2026-09-07", name:"Labor Day"},
  {date:"2026-11-26", name:"Thanksgiving Day"},{date:"2026-12-25", name:"Christmas Day"}
];

export const DEFAULTS = {
  config: { name:"Jazz Harris", hire:"2025-07-28", year:2026, workday:8, birthday:"" },
  allotments: [
    {year:2025, vacation:32, sick:null, notes:"Partial — hired 7/28/2025"},
    {year:2026, vacation:80, sick:null, notes:"10 days PTO"},
    {year:2027, vacation:120, sick:null, notes:"2-year mark — 15 days"},
    {year:2028, vacation:120, sick:null, notes:"15 days"},
    {year:2029, vacation:120, sick:null, notes:"15 days"},
    {year:2030, vacation:160, sick:null, notes:"5-year mark — 20 days"}
  ],
  personalHolidays: [{year:2026, date:null, status:"Unscheduled", notes:""},{year:2027, date:null, status:"Unscheduled", notes:""}],
  tiers: [
    {years:1, vacDays:10, label:"1 Year", notes:"First anniversary at CCCI"},
    {years:2, vacDays:15, label:"2 Years", notes:"+5 days bump (Brie confirmed)"},
    {years:5, vacDays:20, label:"5 Years", notes:"Half-decade milestone"},
    {years:10, vacDays:25, label:"10 Years", notes:"Decade of service"},
    {years:15, vacDays:25, label:"15 Years", notes:"Long-term recognition"},
    {years:20, vacDays:25, label:"20 Years", notes:"Two decades!"},
    {years:25, vacDays:30, label:"25 Years", notes:"Quarter century"}
  ],
  holidays: [ ...CCCI_2026_HOLIDAYS, {date:"2027-01-01", name:"New Year's Day"} ],
  entries: [], holidaysV: "ccci-2026-v1", calFilters: {}, fridays: {},
  logSearch: "", logType: "All", logYear: "All", logView: "list", collapsedMonths: {},
  dismissedInsights: [], showDismissed: false, entryMode: "hours", sugFilters: {}, chartRange: 12,
  notificationsSeen: []
};

// Fold legacy "Vacation" and "Personal" entry types into the unified "PTO" bucket.
// Personal Holiday stays a separate category. Safe + idempotent (only relabels the type field).
export function ptoMigrate(st){
  if (st && Array.isArray(st.entries)) st.entries.forEach(e => { if (e && (e.type === "Vacation" || e.type === "Personal")) e.type = "PTO"; });
  return st;
}
function load(){
  try{
    const r = localStorage.getItem("pto_state");
    if (r){
      const s = JSON.parse(r);
      if (s.allotments){
        if (!s.tiers) s.tiers = JSON.parse(JSON.stringify(DEFAULTS.tiers));
        s.allotments.forEach(a => { if (a.sickTBC === true || a.sick === undefined) a.sick = null; delete a.sickTBC; });
        if (s.holidaysV !== "ccci-2026-v1"){
          const hasWrongOnes = s.holidays && s.holidays.some(h => h.date === "2026-06-19" || h.date === "2026-11-27" || h.date === "2026-12-24");
          const has2026Count = s.holidays ? s.holidays.filter(h => h.date.startsWith("2026")).length : 0;
          if (hasWrongOnes && has2026Count <= 10){
            s.holidays = s.holidays.filter(h => !h.date.startsWith("2026"));
            s.holidays = [...s.holidays, ...CCCI_2026_HOLIDAYS];
          }
          s.holidaysV = "ccci-2026-v1";
        }
        if (!s.personalHolidays) s.personalHolidays = JSON.parse(JSON.stringify(DEFAULTS.personalHolidays));
        if (!s.calFilters) s.calFilters = {};
        if (!s.fridays) s.fridays = {};
        if (s.logSearch === undefined) s.logSearch = "";
        if (!s.logType) s.logType = "All";
        if (!s.logYear) s.logYear = "All";
        if (!s.logView) s.logView = "list";
        if (!s.collapsedMonths) s.collapsedMonths = {};
        if (!s.dismissedInsights) s.dismissedInsights = [];
        if (s.showDismissed === undefined) s.showDismissed = false;
        if (!s.entryMode) s.entryMode = "hours";
        if (!s.sugFilters) s.sugFilters = {};
        if (s.config && s.config.birthday === undefined) s.config.birthday = "";
        if (!s.chartRange) s.chartRange = 12;
        if (!s.notificationsSeen) s.notificationsSeen = [];
        ptoMigrate(s);
        return s;
      }
    }
  }catch(e){}
  return ptoMigrate(JSON.parse(JSON.stringify(DEFAULTS)));
}

export let state: AppState = load();
export function setState(s: AppState){ state = s; }

// Save-sync seam: the Supabase layer registers a handler so every local save
// also debounce-pushes to the account. No-op when signed out (offline-first).
let _onSave: (s: AppState) => void = () => {};
export function setOnSave(fn: (s: AppState) => void){ _onSave = fn; }
export function localTimestamp(): number { return Number(localStorage.getItem("pto_state_ts")) || 0; }

export function save(){
  localStorage.setItem("pto_state", JSON.stringify(state));
  localStorage.setItem("pto_state_ts", String(Date.now()));
  _onSave(state);
}
