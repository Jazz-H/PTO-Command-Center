/* Supabase client + remote state I/O + auth helpers.
   The anon/publishable key is public by design in a static app — data is
   protected by Row-Level Security (each user can only touch their own row),
   not by hiding this key. */
import { createClient } from "@supabase/supabase-js";
import type { AppState } from "./schema.ts";

export const SUPABASE_URL = "https://dulunxlclsilfbyfgncd.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ZzjY5XZhjxsj8ZHTQ_ErAw_gM_V5mBZ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// This user's state row → { data, updatedAt(ms) } or null if none yet.
export async function fetchRemoteState(): Promise<{ data: AppState, updatedAt: number } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("states").select("data, updated_at").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data ? { data: data.data as AppState, updatedAt: new Date(data.updated_at).getTime() } : null;
}

// Upsert this user's whole state document.
export async function pushRemoteState(s: AppState): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("states").upsert({ user_id: user.id, data: s, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Send a passwordless magic link; the email redirects back to this app.
export async function sendMagicLink(email: string){
  return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
}
export async function signOut(){ return supabase.auth.signOut(); }
export async function getSession(){ const { data } = await supabase.auth.getSession(); return data.session; }
export async function getEmail(): Promise<string> { const { data } = await supabase.auth.getUser(); return data.user?.email || ""; }
