"use client";

/**
 * One global undo affordance (rendered by <UndoToast/>). Two shapes:
 *
 *   showUndo({ label, onUndo })            — the action is already committed; Undo reverses it.
 *   showUndo({ label, onUndo, onExpire })  — the action is DEFERRED: onExpire commits it when
 *                                            the toast times out or is superseded; Undo cancels
 *                                            the commit instead. (Used for capture deletion,
 *                                            whose sync tombstone is terminal — nothing can
 *                                            reverse it after it ships, so we ship it late.)
 *
 * One toast at a time: showing a new one settles (expires) the previous immediately, so a
 * deferred commit can never be lost by rapid-fire actions. If the tab closes mid-grace, a
 * deferred action simply never commits — the item survives, which is the safe direction.
 */
import { useSyncExternalStore } from "react";

export interface UndoEntry {
  id: number;
  label: string;
  onUndo: () => void;
  onExpire?: () => void;
}

const GRACE_MS = 10_000;

let current: UndoEntry | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** Dismiss the current toast. expire=true runs its deferred commit (if any). */
function clear(expire: boolean): void {
  if (!current) return;
  if (timer) clearTimeout(timer);
  timer = null;
  const prev = current;
  current = null;
  if (expire) prev.onExpire?.();
  notify();
}

export function showUndo(opts: { label: string; onUndo: () => void; onExpire?: () => void }): void {
  clear(true); // settle any previous deferred commit before replacing it
  current = { id: nextId++, ...opts };
  timer = setTimeout(() => clear(true), GRACE_MS);
  notify();
}

export function undoCurrent(): void {
  if (!current) return;
  if (timer) clearTimeout(timer);
  timer = null;
  const prev = current;
  current = null;
  notify();
  prev.onUndo();
}

/** Settle any pending deferred commit immediately (used by tests and teardown paths). */
export function settleUndo(): void {
  clear(true);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUndo(): UndoEntry | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
