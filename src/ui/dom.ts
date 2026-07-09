/* Shared UI primitives: HTML escaping, the toast, and the small SVG/HTML
   builders (KPI rings, mini-KPI cards, sparklines) reused across the views. */
import { ICO } from "./icons.ts";

// Typed getElementById. Most lookups target form controls, so it defaults to
// HTMLInputElement (has .value/.checked/.select); pass a type arg for others,
// e.g. $<HTMLSelectElement>("yearPicker").options.
export function $<T extends HTMLElement = HTMLInputElement>(id: string): T { return document.getElementById(id) as unknown as T; }

// Transient confirmation toast (bottom of the screen).
export function toast(msg){ const t = document.getElementById("toast"); t.innerHTML = ICO.check + '<span>'+msg+'</span>'; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 2400); }

// Read a resolved CSS custom property off :root (used to theme charts).
export function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// Escape user-supplied text before dropping it into innerHTML.
export function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

// KPI progress rings (small + large) and the mini-KPI card / sparkline builders.
export function ringSVG(pct, cls){
  const r = 17, c = 2*Math.PI*r, p = Math.min(100, Math.max(0, pct)), off = c*(1 - p/100);
  return `<svg class="kpi-ring ${cls}" viewBox="0 0 44 44"><circle class="rt" cx="22" cy="22" r="${r}"/><circle class="rp" cx="22" cy="22" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/><text class="rl" x="22" y="22">${Math.round(p)}%</text></svg>`;
}
export function ringSVG2(pct, cls){
  const r = 20, c = 2*Math.PI*r, p = Math.min(100, Math.max(0, pct)), off = c*(1 - p/100);
  return `<svg class="kpi-ring lg ${cls}" viewBox="0 0 48 48"><circle class="rt" cx="24" cy="24" r="${r}"/><circle class="rp" cx="24" cy="24" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/><text class="rl" x="24" y="21">${Math.round(p)}%</text><text class="rl2" x="24" y="31">used</text></svg>`;
}
export function miniKpi(colorCls, icon, title, value, valueCls, sub){
  return `<div class="kpi"><div class="kpi-top"><div class="kpi-icon ${colorCls}">${icon}</div><span class="kpi-title">${title}</span></div><div class="kpi-body"><div class="kpi-main"><div class="kpi-value ${valueCls||''}">${value}</div><div class="kpi-sub">${sub}</div></div></div></div>`;
}
export function sparklineSVG(values){
  const n = values.length;
  if (n < 2) return "";
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const span = (max - min) || 1;
  const x = i => (i/(n-1))*100;
  const yv = v => 26 - ((v - min)/span)*24;
  const pts = values.map((v,i)=>`${x(i).toFixed(1)},${yv(v).toFixed(1)}`);
  const line = "M" + pts.join(" L");
  const fill = `M0,28 L${pts.join(" L")} L100,28 Z`;
  return `<svg class="kpi-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path class="fill" d="${fill}"/><path class="line" d="${line}"/></svg>`;
}
