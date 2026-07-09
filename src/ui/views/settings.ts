/* Settings view — employee config form, per-year allotments (with sick N/A
   toggle), company-holiday list, the dismissable policy tip, and the account
   snapshot. Reads state + balance/anniversary domains; mutations persist via
   save() and repaint through the refresh() seam. Inline handlers (saveConfig,
   updateAllot, toggleNA, addHoliday, delHoliday, dismissCfgTip) resolve through
   the window bridge. */
import { state, save } from "../../state/store.ts";
import { refresh } from "../refresh.ts";
import { fmt, parseDate, today } from "../../domain/dates.ts";
import { currentBalance } from "../../domain/balance.ts";
import { yearsOfService, nextMilestone } from "../../domain/anniversaries.ts";
import { toast, $ } from "../dom.ts";
import { ICO } from "../icons.ts";

export function dismissCfgTip(){ state.cfgTipDismissed = true; save(); const el = $("cfgTip"); if (el) el.style.display = "none"; }

export function renderSettings(){
  const tipEl = $("cfgTip"); if (tipEl) tipEl.style.display = state.cfgTipDismissed ? "none" : "";
  const c = state.config;
  $("c_name").value = c.name;
  $("c_hire").value = c.hire;
  $("c_year").value = String(c.year);
  $("c_workday").value = String(c.workday);
  $("c_birthday").value = c.birthday || "";
  $("allotList").innerHTML = state.allotments.sort((a,b) => a.year-b.year).map((a,i) => {
    const isNA = a.sick === null;
    return `<div class="year-row"><div class="year-label">${a.year}</div><div><input type="number" value="${a.vacation}" step="0.5" onchange="updateAllot(${i},'vacation',this.value)"/></div><div class="sick-input-wrap"><input type="number" value="${isNA?'':a.sick}" step="0.5" placeholder="${isNA?'N/A':''}" ${isNA?'disabled':''} onchange="updateAllot(${i},'sick',this.value)"/><label class="na-toggle"><input type="checkbox" ${isNA?'checked':''} onchange="toggleNA(${i},this.checked)"/>N/A</label></div><div><input type="text" value="${(a.notes||'').replace(/"/g,'&quot;')}" onchange="updateAllot(${i},'notes',this.value)"/></div></div>`;
  }).join("");
  $("holList").innerHTML = state.holidays.sort((a,b) => a.date.localeCompare(b.date)).map((h,i) => `<div style="display:flex;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line-soft)"><span style="width:140px;color:var(--n-500);font-size:13px;font-variant-numeric:tabular-nums">${fmt(parseDate(h.date))}</span><span style="flex:1;font-size:13px;color:var(--n-800);font-weight:500">${h.name}</span><button class="btn subtle sm" onclick="delHoliday(${i})">${ICO.trash}</button></div>`).join("");
  const snap = $("cfgSnapshot");
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

export function updateAllot(i, field, val){ const sorted = [...state.allotments].sort((a,b) => a.year-b.year); const target = sorted[i]; const idx = state.allotments.indexOf(target); state.allotments[idx][field] = field==="notes" ? val : Number(val); save(); }
export function toggleNA(i, checked){ const sorted = [...state.allotments].sort((a,b) => a.year-b.year); const target = sorted[i]; const idx = state.allotments.indexOf(target); state.allotments[idx].sick = checked ? null : 0; save(); refresh(); toast(checked?"Marked as N/A":"N/A removed"); }
export function saveConfig(){ const c = state.config; c.name = $("c_name").value; c.hire = $("c_hire").value; c.year = Number($("c_year").value); c.workday = Number($("c_workday").value); c.birthday = $("c_birthday").value; save(); refresh(); toast("Settings saved"); }
export function addHoliday(){ const d = $("new_hol_date").value; const n = $("new_hol_name").value; if (!d||!n){ toast("Enter date and name"); return; } state.holidays.push({date:d, name:n}); save(); $("new_hol_date").value=""; $("new_hol_name").value=""; renderSettings(); refresh(); toast("Holiday added"); }
export function delHoliday(i){ const sorted = [...state.holidays].sort((a,b) => a.date.localeCompare(b.date)); const target = sorted[i]; state.holidays = state.holidays.filter(h => h!==target); save(); renderSettings(); refresh(); toast("Holiday removed"); }
