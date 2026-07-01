"use client";

import { signOut, useSession } from "@/lib/supabase/auth";

/**
 * Header affordance: shows "Sign out" only when there's a live session. Renders nothing when the
 * backend is off, while loading, or when signed out (the sign-in screen owns that state).
 */
export function AuthStatus() {
  const session = useSession();
  if (!session) return null;
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      title={session.user.email ?? undefined}
      className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      Sign out
    </button>
  );
}
