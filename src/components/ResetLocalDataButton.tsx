"use client";

import { useState } from "react";
import { clearLocalData } from "@/lib/capture/session";
import { isSupabaseEnabled } from "@/lib/supabase/client";

/**
 * Wipe ALL local data on this device (the same PII-clear path sign-out runs). Only rendered in
 * backend-off builds (offline demo / self-host / dev), where there is no sign-out and this is
 * the one way to clear a device before handing it on. In the signed-in product it's hidden —
 * "Sign out" does this job safely, and a stray tap here would also erase not-yet-synced edits.
 */
export function ResetLocalDataButton() {
  const [working, setWorking] = useState(false);
  if (isSupabaseEnabled()) return null;

  const onReset = async () => {
    if (!window.confirm("Erase all locally stored captures on this device? This cannot be undone.")) {
      return;
    }
    setWorking(true);
    await clearLocalData();
    // Reload so the store re-initializes cleanly (engine restarts on next mount).
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={() => void onReset()}
      disabled={working}
      className="text-xs text-muted underline-offset-4 hover:text-danger hover:underline disabled:opacity-50"
    >
      {working ? "Erasing…" : "Reset local data"}
    </button>
  );
}
