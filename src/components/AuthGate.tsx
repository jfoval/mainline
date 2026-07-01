"use client";

/**
 * Gates the app behind auth WHEN the backend is configured. When it isn't (static Pages build /
 * fully-local dev), it's a passthrough — Phase 1 steps 1–4 offline behavior, no sign-in.
 *
 * It also owns device hygiene: before revealing the app, if the signed-in user differs from the
 * one this device last held (including sign-out), it wipes all local capture data — so one
 * account's captures can never appear under another on a shared device (DATA-MODEL §lifecycle).
 */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { clearLocalData } from "@/lib/capture/session";
import { getSupabase, isSupabaseEnabled } from "@/lib/supabase/client";
import { SignIn } from "./SignIn";

const LAST_UID_KEY = "gtd-last-uid";

type GateState =
  | { status: "loading" }
  | { status: "signedout" }
  | { status: "signedin"; session: Session }
  | { status: "error" };

export function AuthGate({ children }: { children: React.ReactNode }) {
  // Backend off → no auth. Constant at build time, so the hook order below is stable.
  if (!isSupabaseEnabled()) return <>{children}</>;
  return <Gated>{children}</Gated>;
}

function Gated({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    // Serialize every session change through one chain: getSession() and onAuthStateChange's
    // INITIAL_SESSION both fire at startup, so without this the clear-on-switch (a check-then-act
    // on LAST_UID_KEY around an await) could interleave and double-clear.
    let chain: Promise<void> = Promise.resolve();
    const enqueue = (session: Session | null) => {
      chain = chain.then(() => resolve(session)).catch(() => {});
    };

    async function resolve(session: Session | null) {
      const uid = session?.user.id ?? null;
      const last = localStorage.getItem(LAST_UID_KEY);
      if (last !== uid) {
        // Account switch or sign-out. Wipe local PII BEFORE revealing the app or advancing the
        // stored uid. If the wipe FAILS, never reveal (could surface the prior account's data) —
        // land on a recoverable error instead of hanging on "Loading…".
        if (last) {
          try {
            await clearLocalData();
          } catch {
            if (active) setState({ status: "error" });
            return;
          }
        }
        if (uid) localStorage.setItem(LAST_UID_KEY, uid);
        else localStorage.removeItem(LAST_UID_KEY);
      }
      if (!active) return;
      setState(session ? { status: "signedin", session } : { status: "signedout" });
    }

    void supabase.auth.getSession().then(({ data }) => enqueue(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      enqueue(session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state.status === "loading") {
    return <p className="mx-auto flex flex-1 items-center text-sm text-muted">Loading…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-danger">Couldn&apos;t prepare local storage on this device.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-accent rounded-lg px-5 py-2.5 font-medium"
        >
          Reload
        </button>
      </div>
    );
  }
  if (state.status === "signedout") return <SignIn />;
  return <>{children}</>;
}
