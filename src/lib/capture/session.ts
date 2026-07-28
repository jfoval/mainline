"use client";

/**
 * Session lifecycle for capture. On logout / account-switch we MUST clear all local stores —
 * captures are PII and the device may be shared (DATA-MODEL §Data lifecycle). There is no
 * auth in Phase 1 yet, so this is the hook the future auth flow calls; it's also handy for a
 * "reset local data" affordance during development.
 *
 * Order matters: quiesce the sync engine and clear the in-memory view FIRST (so no in-flight
 * flush can write PII back), THEN wipe IndexedDB, THEN drop the db handle so the next account
 * opens a truly fresh database.
 */
import { clearGtdData, resetGtdDbHandle, resetGtdStore } from "@/lib/gtd/store";
import { clearAllData, resetDbHandle } from "./db";
import { resetLocalStore } from "./store";

export async function clearLocalData(): Promise<void> {
  resetLocalStore(); // stop engine, drop listeners, bump generation, clear memory
  resetGtdStore(); // clear the organize (actions/contexts) in-memory view too
  // The two databases are independent — wipe both best-effort so a failure in one never leaves
  // the other's PII on disk, then close both handles, then surface the first failure (AuthGate
  // shows the error state rather than revealing the app over a half-cleared device).
  const wipes = await Promise.allSettled([clearAllData(), clearGtdData()]);
  await Promise.allSettled([resetDbHandle(), resetGtdDbHandle()]);
  // Belt-and-braces: re-bump generations AFTER the wipes so any write that slipped into the
  // window while the app was still interactive is discarded and its generation invalidated.
  resetLocalStore();
  resetGtdStore();
  const failed = wipes.find((r) => r.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
}
