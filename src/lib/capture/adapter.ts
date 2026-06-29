/**
 * The single swap-point between sync backends. Today it returns the LocalOnlyAdapter
 * (zero-infra, fully offline). Step 5 swaps in a SupabaseAdapter here — nothing else in the
 * app references a concrete adapter.
 */
import { LocalOnlyAdapter } from "./local-only-adapter";
import type { SyncAdapter } from "./sync-adapter";

let adapter: SyncAdapter | null = null;

export function getAdapter(): SyncAdapter {
  if (!adapter) {
    adapter = new LocalOnlyAdapter();
  }
  return adapter;
}
