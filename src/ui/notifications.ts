/* Top-bar chrome: the dashboard Insights panel, the notification bell + tray,
   and the account menu. Insights are split by type — alerts (critical/warn) go
   to the bell, recommendations (good/info) to the dashboard. Consumes the
   insights view-model; tab jumps go through the switchTab() seam. Inline handlers
   (toggleNotifPanel, dismissInsight, openNotif, …) resolve through the bridge. */
import { state, save } from "../state/store.ts";
import { switchTab } from "./nav.ts";
import { buildInsights, insightId, insightHtml, isNotifType, liveInsights, DASH_INSIGHT_MAX } from "./insights.ts";
import { ICO } from "./icons.ts";

export function renderInsights(){
  const all = buildInsights().map(i => ({...i, id: insightId(i), dismissable: i.t !== "critical"}));
  const dismissed = new Set(state.dismissedInsights || []);
  const dashOnly = i => !isNotifType(i.t);
  const visible = all.filter(i => dashOnly(i) && !(i.dismissable && dismissed.has(i.id))).slice(0, DASH_INSIGHT_MAX);
  const hiddenOnes = all.filter(i => dashOnly(i) && i.dismissable && dismissed.has(i.id));
  document.getElementById("insightCount").textContent = String(visible.length);
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
export function dismissNotif(id){
  state.dismissedInsights = state.dismissedInsights || [];
  if (!state.dismissedInsights.includes(id)) state.dismissedInsights.push(id);
  save(); renderNotifPanel(); refreshNotifDot(); renderInsights();
}
export function toggleNotifPanel(ev){
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
export function closeNotifPanel(){ const p = document.getElementById("notifPanel"); const btn = document.getElementById("notifBtn"); if (p) p.classList.remove("open"); if (btn) btn.setAttribute("aria-expanded","false"); }
export function markAllNotifsRead(){ state.notificationsSeen = activeNotifs().map(i => i.id); save(); _notifUnread = new Set(); renderNotifPanel(); refreshNotifDot(); }
export function toggleUserMenu(ev){
  if (ev) ev.stopPropagation();
  const w = document.querySelector(".user-wrap"); const m = document.getElementById("userMenu"); const btn = document.getElementById("userChipBtn");
  if (!w || !m) return;
  if (m.classList.contains("open")){ closeUserMenu(); return; }
  closeNotifPanel();
  m.classList.add("open"); w.classList.add("open"); if (btn) btn.setAttribute("aria-expanded","true");
}
export function closeUserMenu(){ const w = document.querySelector(".user-wrap"); const m = document.getElementById("userMenu"); const btn = document.getElementById("userChipBtn"); if (m) m.classList.remove("open"); if (w) w.classList.remove("open"); if (btn) btn.setAttribute("aria-expanded","false"); }
export function openNotif(id, tab){
  closeNotifPanel();
  switchTab(tab);
  if (tab === 'dash'){ const el = document.getElementById("insights"); if (el) setTimeout(() => el.scrollIntoView({behavior:"smooth", block:"nearest"}), 90); }
}
export function dismissInsight(id){ state.dismissedInsights = state.dismissedInsights || []; if (!state.dismissedInsights.includes(id)) state.dismissedInsights.push(id); save(); renderInsights(); }
export function restoreInsight(id){ state.dismissedInsights = (state.dismissedInsights || []).filter(x => x !== id); if (!(state.dismissedInsights.length)) state.showDismissed = false; save(); renderInsights(); }
export function toggleShowDismissed(){ state.showDismissed = !state.showDismissed; save(); renderInsights(); }
export function dismissAllInsights(){
  const all = buildInsights().map(i => ({...i, id: insightId(i), dismissable: i.t !== "critical"}));
  state.dismissedInsights = state.dismissedInsights || [];
  all.filter(i => i.dismissable).forEach(i => { if (!state.dismissedInsights.includes(i.id)) state.dismissedInsights.push(i.id); });
  save(); renderInsights();
}
