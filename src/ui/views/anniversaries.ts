/* Anniversaries view — renders the tenure KPIs, milestone timeline, tier table,
   alerts, and the PTO-growth line chart. Reads the anniversary domain; writes to
   its own DOM containers. Inline onchange handlers resolve through the window
   bridge (updateTier). */
import { state, save } from "../../state/store.ts";
import { today, parseDate, fmt, DAYNAMES, daysBetween } from "../../domain/dates.ts";
import { yearsOfService, currentMilestone, nextMilestone, anniversaryFor } from "../../domain/anniversaries.ts";
import { miniKpi, cssVar } from "../dom.ts";
import { ICO } from "../icons.ts";

let tierChart;

export function renderAnniversaries(){
  const t = today(); const hire = parseDate(state.config.hire);
  const yos = yearsOfService(t); const yosYears = Math.floor(yos); const yosMonths = Math.floor((yos-yosYears)*12);
  const cur = currentMilestone(t); const nxt = nextMilestone(t);
  document.getElementById("annKpis").innerHTML =
    miniKpi("blue", ICO.calendar, "Hire Date", fmt(hire,{month:"short",day:"numeric",year:"numeric"}), "sm", `${DAYNAMES[hire.getDay()]} · CCCI`) +
    miniKpi("teal", ICO.clock, "Service Tenure", `${yosYears}<span class="unit">yrs ${yosMonths} mo</span>`, "v-teal", cur ? "Current tier: "+cur.label : "Pre-1yr") +
    miniKpi("purple", ICO.award, "Next Milestone", nxt ? nxt.label : "Max", "v-purple sm", nxt ? fmt(nxt.date,{month:"short",day:"numeric"})+" · "+nxt.daysUntil+" days" : "Top tier reached") +
    miniKpi("magenta", ICO.chevUp, "Next Bump", `+${nxt ? (nxt.vacDays-(cur?cur.vacDays:0)) : 0}<span class="unit">days</span>`, "v-magenta", nxt ? nxt.vacDays+" days total at "+nxt.label : "N/A");
  document.getElementById("milestoneList").innerHTML = state.tiers.map(tier => {
    const date = anniversaryFor(tier.years); const passed = date <= t;
    const isCurrent = cur && tier.years === cur.years; const isNext = nxt && tier.years === nxt.years;
    const daysAway = daysBetween(t, date); const yearsAway = (daysAway/365.25).toFixed(1);
    const cls = isNext ? "next" : isCurrent ? "current" : passed ? "past" : "";
    const tag = isNext ? '<span class="chip r">Next</span>' : isCurrent ? '<span class="chip g">You are here</span>' : '';
    return `<div class="milestone ${cls}"><div class="mile-circle">${tier.years}yr</div><div class="mile-body"><div class="mile-title">${tier.label} ${tag}</div><div class="mile-sub">${fmt(date,{weekday:"short",month:"short",day:"numeric",year:"numeric"})} · ${passed ? Math.abs(daysAway)+" days ago" : "in "+daysAway+" days ("+yearsAway+" yrs)"}</div></div><div class="mile-days"><div class="num">${tier.vacDays}</div><div class="lbl">days</div></div></div>`;
  }).join("");
  const ins = [];
  if (nxt && nxt.daysUntil <= 90){ ins.push({t:"warn", icon:ICO.clock, h:`${nxt.label} approaching`, b:`<b>${nxt.daysUntil} days</b> until ${fmt(nxt.date)}. PTO increases to <b>${nxt.vacDays} days/year</b>.`}); }
  if (nxt){ const bump = nxt.vacDays - (cur?cur.vacDays:0); if (bump > 0){ ins.push({t:"good", icon:ICO.celebrate, h:`Upcoming bump: +${bump} days/year`, b:`At ${nxt.label} you'll receive <b>${nxt.vacDays} days (${nxt.vacDays*8} hrs)</b> annually — up from ${cur?cur.vacDays:0}.`}); } }
  if (yosYears >= 5){ ins.push({t:"good", icon:ICO.star, h:"Milestone employee", b:`${yosYears} years at CCCI — that's a real career investment.`}); }
  else if (yosYears >= 1){ ins.push({t:"info", icon:ICO.clock, h:"Building your career", b:`${yosYears} ${yosYears===1?"year":"years"} in — on your way to the next milestone.`}); }
  else { ins.push({t:"info", icon:ICO.calendar, h:"First year at CCCI", b:`1-year anniversary on <b>${fmt(anniversaryFor(1))}</b> (${daysBetween(t, anniversaryFor(1))} days away).`}); }
  if (nxt && nxt.daysUntil > 90 && nxt.daysUntil <= 180){ ins.push({t:"info", icon:ICO.calendar, h:"Halfway to next milestone", b:`Under 6 months until ${nxt.label}. Start planning any milestone celebrations!`}); }
  if (cur && cur.years === 1 && nxt && nxt.years === 2){ ins.push({t:"good", icon:ICO.star, h:"Biggest bump ahead", b:"The 2-year milestone brings the largest single PTO increase you'll see (+5 days)."}); }
  document.getElementById("annInsights").innerHTML = ins.length ? ins.map(i => `<div class="insight ${i.t}"><div class="insight-icon">${i.icon}</div><div class="insight-body"><strong>${i.h}</strong>${i.b}</div></div>`).join("") : `<div class="empty"><div class="empty-icon">${ICO.info}</div><h4>No alerts</h4><p>You're on track.</p></div>`;
  const tb = document.querySelector("#tierTable tbody");
  tb.innerHTML = state.tiers.map((tier, idx) => { const date = anniversaryFor(tier.years);
    return `<tr><td data-label="Milestone"><b>${tier.label}</b></td><td data-label="Anniversary">${fmt(date,{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</td><td data-label="Year" class="mono">Year ${tier.years}</td><td data-label="PTO days"><input type="number" value="${tier.vacDays}" step="1" min="0" onchange="updateTier(${idx},'vacDays',this.value)"/></td><td data-label="Notes"><input type="text" value="${(tier.notes||'').replace(/"/g,'&quot;')}" onchange="updateTier(${idx},'notes',this.value)"/></td></tr>`;
  }).join("");
  renderTierChart();
}

function renderTierChart(){
  const cvs = document.getElementById("tierChart"); if (!cvs || typeof Chart === "undefined") return;
  const tiers = [...state.tiers].sort((a,b) => a.years-b.years);
  const labels = tiers.map(t => t.years+"yr"); const data = tiers.map(t => t.vacDays);
  const dark = document.documentElement.getAttribute('data-theme')==='dark'; const line = cssVar('--data-blue'); const tick = cssVar('--chart-tick'), grid = cssVar('--chart-grid');
  if (tierChart) tierChart.destroy();
  tierChart = new Chart(cvs, {type:'line',
    data:{labels, datasets:[{label:'PTO days/year', data, borderColor:line, backgroundColor:(ctx)=>{const c=ctx.chart.ctx; const g=c.createLinearGradient(0,0,0,220); g.addColorStop(0,cssVar('--data-blue-soft')); g.addColorStop(1,'rgba(0,0,0,0)'); return g;}, stepped:true, fill:true, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:line, pointBorderColor:dark?'#0a0a0a':'#fff', pointBorderWidth:2, borderWidth:2.5}]},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{backgroundColor:dark?'#fff':'#0F172A',titleColor:dark?'#000':'#fff',bodyColor:dark?'#000':'#fff',padding:10,cornerRadius:8,callbacks:{label:ctx=>` ${ctx.parsed.y} days/year`}}},
      scales:{x:{grid:{display:false}, ticks:{font:{size:11},color:tick}, border:{display:false}}, y:{beginAtZero:true, grid:{color:grid,drawTicks:false}, ticks:{font:{size:10},color:tick,padding:6,callback:v=>v+'d'}, border:{display:false}}}}
  });
}

export function updateTier(i, field, val){ state.tiers[i][field] = field==="notes" ? val : Number(val); save(); }
