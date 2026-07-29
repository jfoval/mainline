"use client";

/**
 * Shows the app's navigation only to someone who's actually signed in. A stranger landing on
 * mainline.support should meet one clear page — not a tab bar of sections that all bounce back
 * to the sign-in form. With the backend off (the offline demo build) there's no sign-in at all,
 * so the nav is always on.
 */
import { isSupabaseEnabled } from "@/lib/supabase/client";
import { useSession } from "@/lib/supabase/auth";

export function NavGate({ children }: { children: React.ReactNode }) {
  const session = useSession(); // undefined while resolving — render nothing rather than flash
  if (!isSupabaseEnabled()) return <>{children}</>;
  return session ? <>{children}</> : null;
}
