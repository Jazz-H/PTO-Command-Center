/* Auth gate — sits in front of the app. On load we check for a persisted
   session; if present the app boots (instantly, from the local cache) and syncs
   with the account in the background; if absent we show the magic-link sign-in.
   Offline-first: the local cache is always the boot source, so an unreachable
   Supabase never blocks a returning, signed-in user. */
import { state, setState, save, setOnSave, localTimestamp, ptoMigrate, nameFromEmail } from "./state/store.ts";
import { refresh } from "./ui/refresh.ts";
import { supabase, fetchRemoteState, pushRemoteState, sendMagicLink, verifyCode, signOut, getEmail } from "./state/supabase.ts";

let _pushTimer: any = null;
function debouncedPush(){ clearTimeout(_pushTimer); _pushTimer = setTimeout(() => { pushRemoteState(state).catch(()=>{}); }, 1200); }

// Reconcile the local cache with the account's remote row (last-write-wins by
// timestamp), then wire future saves to push. Swallows network errors so an
// offline session keeps working from cache.
async function syncFromRemote(){
  try{
    const remote = await fetchRemoteState();
    if (!remote){
      if (!state.config.name){                                 // brand-new account with a blank profile →
        const nm = nameFromEmail(await getEmail());             // seed a display name from the login email
        if (nm){ state.config.name = nm; save(); refresh(); }
      }
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
let _pendingEmail = "";
function wireSignInForm(){
  if (_formWired) return; _formWired = true;
  const form = document.getElementById("authForm") as HTMLFormElement | null;
  const email = document.getElementById("authEmail") as HTMLInputElement | null;
  const code = document.getElementById("authCode") as HTMLInputElement | null;
  const msg = document.getElementById("authMsg");
  const sendBtn = document.getElementById("authSubmit") as HTMLButtonElement | null;
  const verifyBtn = document.getElementById("authVerify") as HTMLButtonElement | null;
  const backBtn = document.getElementById("authBack") as HTMLButtonElement | null;
  if (!form) return;
  const setMsg = (text: string, cls = "") => { if (msg){ msg.className = "auth-msg " + cls; msg.textContent = text; } };

  // Step 1 — send the code (also emails a magic link as a fallback).
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const addr = (email?.value || "").trim();
    if (!addr){ setMsg("Enter your email.", "err"); return; }
    if (sendBtn){ sendBtn.disabled = true; sendBtn.textContent = "Sending…"; }
    setMsg("");
    const { error } = await sendMagicLink(addr);
    if (sendBtn){ sendBtn.disabled = false; sendBtn.textContent = "Send sign-in code"; }
    if (error){ setMsg(error.message || "Couldn't send — try again.", "err"); return; }
    _pendingEmail = addr;
    form.setAttribute("data-step", "code");
    setMsg(`Code sent to ${addr}. Enter it here — you can read it on any device.`, "ok");
    setTimeout(() => code?.focus(), 60);
  });

  // Step 2 — verify the 6-digit code on THIS device.
  const doVerify = async () => {
    const token = (code?.value || "").trim();
    if (token.length < 4){ setMsg("Enter the code from your email.", "err"); return; }
    if (verifyBtn){ verifyBtn.disabled = true; verifyBtn.textContent = "Verifying…"; }
    setMsg("");
    const { error } = await verifyCode(_pendingEmail, token);
    if (verifyBtn){ verifyBtn.disabled = false; verifyBtn.textContent = "Verify & sign in"; }
    // On success, onAuthStateChange(SIGNED_IN) takes over and boots the app.
    if (error) setMsg(error.message || "That code didn't work — check it or resend.", "err");
  };
  verifyBtn?.addEventListener("click", doVerify);
  code?.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter"){ e.preventDefault(); doVerify(); } });
  backBtn?.addEventListener("click", () => { form.setAttribute("data-step", "email"); setMsg(""); if (code) code.value = ""; });
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
