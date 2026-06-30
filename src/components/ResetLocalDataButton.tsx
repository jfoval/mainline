"use client";

import { useState } from "react";
import { clearLocalData } from "@/lib/capture/session";

/**
 * Dev/shared-device affordance: wipe ALL local capture data (the logout / account-switch
 * PII-clear path from DATA-MODEL §Data lifecycle). With no auth yet in Phase 1, this is the
 * only UI caller of clearLocalData — it also makes invariant 6 manually verifiable.
 */
export function ResetLocalDataButton() {
  const [working, setWorking] = useState(false);

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
