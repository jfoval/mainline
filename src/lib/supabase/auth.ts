"use client";

/**
 * Thin auth helpers over the Supabase client. Auth is passwordless magic-link (the product
 * choice): the app is a static SPA, so everything happens client-side against Supabase Auth.
 */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseEnabled } from "./client";

/** Where the emailed magic link returns to. basePath-aware so it works locally and on Pages. */
export function authRedirectUrl(): string {
  const bp = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${window.location.origin}${bp}/`;
}

/** Send a magic-link email. Resolves with an error message, or null on success. */
export async function sendMagicLink(email: string): Promise<string | null> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  if (!isSupabaseEnabled()) return;
  await getSupabase().auth.signOut();
}

/**
 * Track the current session for UI. `undefined` while resolving, `null` when signed out (or the
 * backend is off). Purely reactive — the device-hygiene / clear-on-switch logic lives in AuthGate.
 */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(
    isSupabaseEnabled() ? undefined : null,
  );
  useEffect(() => {
    if (!isSupabaseEnabled()) return;
    const supabase = getSupabase();
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return session;
}
