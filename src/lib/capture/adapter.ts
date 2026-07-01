/**
 * The single swap-point between sync backends. It returns the SupabaseAdapter when the backend
 * is configured (NEXT_PUBLIC_SUPABASE_* set) and the offline LocalOnlyAdapter otherwise — so the
 * static GitHub Pages build and fully-local dev keep working with zero backend. Nothing else in
 * the app references a concrete adapter.
 */
import { isSupabaseEnabled } from "@/lib/supabase/client";
import { LocalOnlyAdapter } from "./local-only-adapter";
import { SupabaseAdapter } from "./supabase-adapter";
import type { SyncAdapter } from "./sync-adapter";

let adapter: SyncAdapter | null = null;

export function getAdapter(): SyncAdapter {
  if (!adapter) {
    adapter = isSupabaseEnabled() ? new SupabaseAdapter() : new LocalOnlyAdapter();
  }
  return adapter;
}
