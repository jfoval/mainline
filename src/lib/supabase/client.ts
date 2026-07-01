"use client";

/**
 * Supabase browser client — the ONLY place the app talks to Supabase.
 *
 * Env-gated: when NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are absent (e.g. the static GitHub
 * Pages build, or a fully-local dev run), `isSupabaseEnabled()` is false and the app stays on
 * the offline LocalOnlyAdapter with no auth — Phase 1 steps 1–4 behavior, unchanged.
 *
 * The key is the PUBLIC client key (legacy "anon" JWT or the newer `sb_publishable_…`). It is
 * safe in the browser bundle: Row-Level Security — not key secrecy — is what protects data.
 * The service_role / secret key must NEVER reach the client and is not read here.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the backend is configured. Inlined at build time (NEXT_PUBLIC_*). */
export function isSupabaseEnabled(): boolean {
  return Boolean(URL && ANON_KEY);
}

let client: SupabaseClient | null = null;

/** The memoized browser client. Throws if called when the backend isn't configured. */
export function getSupabase(): SupabaseClient {
  if (!URL || !ANON_KEY) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY unset).");
  }
  if (!client) {
    client = createClient(URL, ANON_KEY, {
      auth: {
        persistSession: true, // session survives reloads / offline (localStorage)
        autoRefreshToken: true,
        detectSessionInUrl: true, // completes the magic-link redirect on load
        flowType: "pkce", // SPA-safe code exchange for the emailed link
      },
    });
  }
  return client;
}
