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
import { clearAllData, resetDbHandle } from "./db";
import { resetLocalStore } from "./store";

export async function clearLocalData(): Promise<void> {
  resetLocalStore(); // stop engine, drop listeners, bump generation, clear memory
  await clearAllData(); // wipe every IndexedDB store
  await resetDbHandle(); // close + forget the handle
}
