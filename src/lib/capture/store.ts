"use client";

/**
 * React-facing capture store. Holds the optimistic in-memory view, persists every change
 * atomically (capture + op) to IndexedDB, and drives the SyncEngine. Components read it via
 * `useCaptures()` (useSyncExternalStore).
 *
 * Durability discipline (post-review):
 *   - DURABLE BEFORE PUBLISH: every action awaits the atomic IndexedDB commit BEFORE touching
 *     the in-memory map / notifying the UI. A capture is never shown that isn't already queued.
 *   - NO CLOBBER: reconcile folds server-authoritative fields without ever overwriting a newer
 *     optimistic edit or regressing client_seq.
 *   - CROSS-TAB: a BroadcastChannel keeps every tab's in-memory map fresh from IndexedDB.
 *   - CLEAN LOGOUT: resetLocalStore() stops the engine, drops listeners, and bumps a generation
 *     so any late async work can't repopulate cleared PII.
 */
import { useEffect, useSyncExternalStore } from "react";
import { applyOpToClient } from "./apply";
import {
  commitLocalOp,
  getAllCaptures,
  isCaptureStorageAvailable,
} from "./db";
import { SyncEngine } from "./sync-engine";
import type { Capture, CaptureOp, CaptureSource, CaptureStatus, OpKind } from "./types";

// ---- module state ----
const captures = new Map<string, Capture>();
const listeners = new Set<() => void>();
const engine = new SyncEngine();

const EMPTY: readonly Capture[] = Object.freeze([]);
let snapshot: readonly Capture[] = EMPTY;
let initialized = false;
let initPromise: Promise<void> | null = null;
let generation = 0; // bumped on reset; guards late async work after logout
let engineUnsub: (() => void) | null = null;

// ---- helpers ----
function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

// Unique per browsing context, to ignore our own BroadcastChannel echoes.
const SENDER = typeof crypto !== "undefined" ? crypto.randomUUID() : "ssr";
let channel: BroadcastChannel | null = null;

function initChannel(): void {
  if (typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("gtd-capture");
  channel.onmessage = (e: MessageEvent) => {
    if (e.data?.sender === SENDER) return; // ignore our own writes
    void reloadFromDb();
  };
}

function closeChannel(): void {
  channel?.close();
  channel = null;
}

function broadcast(): void {
  channel?.postMessage({ sender: SENDER });
}

/** Reload the in-memory map from durable IndexedDB (cross-tab sync). Safe because commit
 *  precedes publish — durable state is always the source of truth. */
async function reloadFromDb(): Promise<void> {
  if (!isCaptureStorageAvailable()) return;
  const gen = generation;
  const rows = await getAllCaptures();
  if (gen !== generation) return;
  captures.clear();
  for (const row of rows) captures.set(row.client_id, row);
  notify();
}

/** Best-effort capture source for this device/runtime. */
function detectSource(): CaptureSource {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  const standalone =
    (typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches) ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone && /iPhone|iPad|iPod/.test(ua)) return "ios_pwa";
  if (standalone && /Android/.test(ua)) return "android_pwa";
  return "web";
}

/** Inbox ordering: newest first. Unsynced (no server_seq) float to top by device time;
 *  synced ordered by authoritative server_seq desc. */
function compareCaptures(a: Capture, b: Capture): number {
  const aHas = a.server_seq != null;
  const bHas = b.server_seq != null;
  if (aHas && bHas) return (b.server_seq as number) - (a.server_seq as number);
  if (!aHas && !bHas) return b.captured_at.localeCompare(a.captured_at);
  return aHas ? 1 : -1; // unsynced first
}

function rebuildSnapshot(): void {
  snapshot = Object.freeze([...captures.values()].sort(compareCaptures));
}

function notify(): void {
  rebuildSnapshot();
  for (const l of listeners) l();
}

// ---- init ----
async function doInit(): Promise<void> {
  if (!isCaptureStorageAvailable()) {
    initialized = true;
    return;
  }
  const gen = generation;
  const rows = await getAllCaptures();
  if (gen !== generation) return; // reset happened mid-init
  for (const row of rows) captures.set(row.client_id, row);

  // Listener is generation-guarded so post-logout reconciles can't repopulate PII.
  engineUnsub = engine.onChange((changed) => {
    if (gen === generation) onEngineReconcile(changed);
  });

  // Heal any capture whose per-flush ack reconcile was lost to a crash/reload.
  await engine.reconcileFromServer();
  if (gen !== generation) return;

  initChannel();
  engine.start();
  initialized = true;
  notify();
}

function ensureInit(): Promise<void> {
  if (initialized) return Promise.resolve();
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

/** Fold engine-reconciled rows into memory WITHOUT clobbering a newer optimistic edit. */
function onEngineReconcile(changed: Capture[]): void {
  for (const c of changed) {
    const cur = captures.get(c.client_id);
    if (!cur || c.client_seq >= cur.client_seq) {
      captures.set(c.client_id, c);
    } else {
      // In-memory is newer (a queued edit landed after reconcile's read) — adopt only the
      // server-authoritative ordering fields; keep the newer optimistic content + seq.
      captures.set(c.client_id, {
        ...cur,
        synced_at: c.synced_at,
        server_seq: c.server_seq,
        skew_ms: c.skew_ms,
        pending: c.pending,
      });
    }
  }
  notify();
}

// ---- subscription API (useSyncExternalStore) ----
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly Capture[] {
  return snapshot;
}

function getServerSnapshot(): readonly Capture[] {
  return EMPTY;
}

// ---- write actions ----
async function applyAndCommit(existing: Capture | null, op: CaptureOp): Promise<Capture> {
  const next = applyOpToClient(existing, op);
  // DURABLE FIRST — never publish to the UI what isn't durably queued.
  await commitLocalOp(next, op);
  captures.set(next.client_id, next);
  notify(); // optimistic publish (now safely backed by durable state)
  broadcast(); // let other tabs refresh
  engine.requestFlush(); // fire-and-forget sync
  return next;
}

/** Capture new text (or a finished voice transcript). Returns the new client_id, or null if
 *  the durable write failed (in which case nothing is shown and the caller keeps the input). */
export async function captureText(rawText: string): Promise<string | null> {
  const text = rawText.trim();
  if (!text || !isCaptureStorageAvailable()) return null;
  await ensureInit();
  const clientId = uuid();
  const op: CaptureOp = {
    op_id: uuid(),
    client_id: clientId,
    client_seq: 1,
    kind: "create",
    raw_text: text,
    source: detectSource(),
    captured_at: nowIso(),
    created_at: nowIso(),
  };
  try {
    await applyAndCommit(null, op);
    return clientId;
  } catch {
    return null; // durable write failed → nothing shown, nothing queued, no data lost
  }
}

function nextOp(existing: Capture, kind: OpKind, payload: Partial<CaptureOp>): CaptureOp {
  return {
    op_id: uuid(),
    client_id: existing.client_id,
    client_seq: existing.client_seq + 1,
    kind,
    created_at: nowIso(),
    ...payload,
  };
}

export async function editCapture(clientId: string, rawText: string): Promise<void> {
  const existing = captures.get(clientId);
  const text = rawText.trim();
  if (!existing || existing.status === "discarded" || !text) return;
  if (text === existing.raw_text) return;
  try {
    await applyAndCommit(existing, nextOp(existing, "edit", { raw_text: text }));
  } catch {
    // durable write failed — in-memory untouched (commit-first); op simply not applied
  }
}

export async function discardCapture(clientId: string): Promise<void> {
  const existing = captures.get(clientId);
  if (!existing || existing.status === "discarded") return;
  try {
    await applyAndCommit(existing, nextOp(existing, "delete", {}));
  } catch {
    /* see editCapture */
  }
}

export async function setCaptureStatus(
  clientId: string,
  status: CaptureStatus,
): Promise<void> {
  const existing = captures.get(clientId);
  if (!existing || existing.status === "discarded" || existing.status === status) return;
  try {
    await applyAndCommit(existing, nextOp(existing, "set_status", { status }));
  } catch {
    /* see editCapture */
  }
}

/**
 * Tear down the local view (paired with clearAllData on logout/account-switch). Stops the
 * engine, drops the engine listener, closes the cross-tab channel, and bumps the generation so
 * any in-flight async work is ignored — cleared PII can't be repopulated.
 */
export function resetLocalStore(): void {
  generation++;
  engine.stop();
  if (engineUnsub) {
    engineUnsub();
    engineUnsub = null;
  }
  closeChannel();
  captures.clear();
  snapshot = EMPTY;
  initialized = false;
  initPromise = null;
  notify();
}

// ---- hooks ----
export function useCaptures(): readonly Capture[] {
  useEffect(() => {
    void ensureInit();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
