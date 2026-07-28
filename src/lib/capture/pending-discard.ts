"use client";

/**
 * Deferred capture deletion. The capture op-log's tombstone is TERMINAL (by design — see
 * apply.ts), so an accidental delete can't be reversed once the discard op exists. Undo therefore
 * works by NOT writing the op until the undo window passes: deletes land here first, the inbox
 * hides them, and only expiry commits the real discard. Undo just unhides. If the tab dies
 * mid-grace, the capture survives — the safe failure direction. In-memory only, per-tab.
 */
import { useSyncExternalStore } from "react";
import { discardCapture } from "./store";

const pending = new Set<string>();
let snapshot: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();

function notify(): void {
  snapshot = new Set(pending);
  for (const l of listeners) l();
}

export function deferDiscard(clientId: string): void {
  pending.add(clientId);
  notify();
}

export function cancelDiscard(clientId: string): void {
  pending.delete(clientId);
  notify();
}

export function commitDiscard(clientId: string): void {
  pending.delete(clientId);
  notify();
  void discardCapture(clientId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingDiscards(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}
