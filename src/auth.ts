/* Auth gate — sits in front of the app. On load we check for a persisted
   session; if present the app boots (instantly, from the local cache) and syncs
   with the account in the background; if absent we show the magic-link sign-in.
   Offline-first: the local cache is always the boot source, so an unreachable
   Supabase never blocks a returning, signed-in user. */
import { state, setState, save, setOnSave, localTimestamp, ptoMigrate } from "./state/store.ts";
import { refresh } from "./ui/refresh.ts";
import { supabase, fetchRemoteState, pushRemoteState, sendMagicLink, signOut, getEmail } from "./state/supabase.ts";

let _pushTimer: any = null;
function debouncedPush(){ clearTimeout(_pushTimer); _pushTimer = setTimeout(() => { pushRemoteState(state).catch(()=>{}); }, 1200); }

// Reconcile the local cache with the account's remote row (last-write-wins by
// timestamp), then wire future saves to push. Swallows network errors so an
// offline session keeps working from cache.
async function syncFromRemote(){
  try{
    const remote = await fetchRemoteState();
    if (!remote){
      await pushRemoteState(state).catch(()=>{});              // first sign-in on this account → seed from local
    } else if (remote.updatedAt > localTimestamp()){
      setState(ptoMigrate(remote.data)); save(); refresh();    // remote is newer → pull + repaint
    } else {
      await pushRemoteState(state).catch(()=>{});              // local is newer (offline edits) → push up
    }
  }catch(e){ /* offline / unreachable — keep the local cache */ }
  setOnSave(debouncedPush);
}

const gate = () => document.getElementById("authGate");
function setGate(mode: "pending" | "in" | "out"){ const g = gate(); if (g) g.setAttribute("data-mode", mode); document.documentElement.setAttribute("data-auth", mode); }

function showAccountEmail(){ getEmail().then(email => { document.querySelectorAll<HTMLElement>(".acct-email").forEach(el => el.textContent = email); }).catch(()=>{}); }

let _formWired = false;
function wireSignInForm(){
  if (_formWired) return; _formWired = true;
  const form = document.getElementById("authForm") as HTMLFormElement | null;
  const email = document.getElementById("authEmail") as HTMLInputElement | null;
  const msg = document.getElementById("authMsg");
  const btn = document.getElementById("authSubmit") as HTMLButtonElement | null;
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const addr = (email?.value || "").trim();
    if (!addr){ if (msg) msg.textContent = "Enter your email."; return; }
    if (btn){ btn.disabled = true; btn.textContent = "Sending…"; }
    if (msg){ msg.className = "auth-msg"; msg.textContent = ""; }
    const { error } = await sendMagicLink(addr);
    if (btn){ btn.disabled = false; btn.textContent = "Send magic link"; }
    if (msg){
      if (error){ msg.className = "auth-msg err"; msg.textContent = error.message || "Couldn't send the link — try again."; }
      else { msg.className = "auth-msg ok"; msg.textContent = `Check ${addr} for a sign-in link.`; }
    }
  });
}

export async function signOutAccount(){
  setOnSave(() => {});          // stop pushing during teardown
  try{ await signOut(); }catch(e){}
  location.reload();            // cleanest reset back to the gate
}

// Called by app.ts once the shell + seams are ready. `boot` renders the app.
export function initAuth(boot: () => void){
  let booted = false;
  const enter = () => { if (booted) return; booted = true; setGate("in"); showAccountEmail(); boot(); };

  setGate("pending");
  wireSignInForm();

  supabase.auth.getSession().then(({ data }) => {
    if (data.session){ enter(); syncFromRemote(); }   // returning session → boot from cache now, sync in background
    else setGate("out");                              // no session → show sign-in
  }).catch(() => setGate("out"));

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && !booted){ await syncFromRemote(); enter(); }   // fresh magic-link login
    else if (event === "SIGNED_OUT"){ if (booted) location.reload(); }
  });
}
