"use client";

/**
 * React-facing store for the GTD organize domain. Loads actions + contexts from IndexedDB, seeds
 * a default context set on first run, and exposes the writes used by Clarify and the Next Actions
 * view. Local-first (no op-log yet — that arrives with sync, mirroring the capture spine), but it
 * follows the capture store's proven disciplines:
 *
 *   - DURABLE BEFORE PUBLISH: every write persists to IndexedDB before touching the in-memory
 *     map / notifying the UI, and returns null/false instead of throwing when the write fails.
 *   - GENERATION GUARD: `generation` is bumped on reset (logout/account-switch); every async path
 *     re-checks it after EVERY await so late work can never write PII back post-wipe or
 *     repopulate cleared memory (see AuthGate/session.ts).
 *   - CROSS-TAB: a BroadcastChannel keeps other tabs' views fresh from IndexedDB.
 *   - IDEMPOTENT CLARIFY: one action per source capture (by_source lookup), so a crash between
 *     the action write and the capture status change can't produce duplicates on re-clarify.
 */
import { useEffect, useSyncExternalStore } from "react";
import { isSupabaseEnabled } from "@/lib/supabase/client";
import {
  clearGtdData,
  getGtdDB,
  isGtdStorageAvailable,
  putRowWithOutbox,
  resetGtdDbHandle,
  type GtdChange,
} from "./db";
import { gtdSync } from "./sync";
import {
  DEFAULT_CONTEXTS,
  type Action,
  type ActionStatus,
  type Context,
  type Energy,
  type Project,
  type ProjectStatus,
  type ReferenceItem,
} from "./types";

const contexts = new Map<string, Context>();
const actions = new Map<string, Action>();
const projects = new Map<string, Project>();
const listeners = new Set<() => void>();

const EMPTY_ACTIONS: readonly Action[] = Object.freeze([]);
const EMPTY_CONTEXTS: readonly Context[] = Object.freeze([]);
const EMPTY_PROJECTS: readonly Project[] = Object.freeze([]);
let actionsSnap: readonly Action[] = EMPTY_ACTIONS;
let contextsSnap: readonly Context[] = EMPTY_CONTEXTS;
let projectsSnap: readonly Project[] = EMPTY_PROJECTS;

let initialized = false;
let initPromise: Promise<void> | null = null;
let generation = 0; // bumped on reset; every async path re-checks it after each await

function uuid(): string {
  return crypto.randomUUID();
}
function nowIso(): string {
  return new Date().toISOString();
}

// ---- cross-tab sync (mirrors capture/store.ts) ----
const SENDER = typeof crypto !== "undefined" ? crypto.randomUUID() : "ssr";
let channel: BroadcastChannel | null = null;

function initChannel(): void {
  if (typeof BroadcastChannel === "undefined" || channel) return;
  channel = new BroadcastChannel("gtd-organize");
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

/** Reload memory from durable IndexedDB (cross-tab). Generation-guarded. */
async function reloadFromDb(): Promise<void> {
  if (!isGtdStorageAvailable()) return;
  const gen = generation;
  try {
    const db = await getGtdDB();
    if (gen !== generation) return;
    const [allContexts, allActions, allProjects] = await Promise.all([
      db.getAll("contexts"),
      db.getAll("actions"),
      db.getAll("projects"),
    ]);
    if (gen !== generation) return;
    contexts.clear();
    actions.clear();
    projects.clear();
    for (const c of allContexts) contexts.set(c.id, c);
    for (const a of allActions) actions.set(a.id, a);
    for (const p of allProjects) projects.set(p.id, p);
    notify();
  } catch {
    // transient read failure — next broadcast/init will catch up
  }
}

function rebuild(): void {
  actionsSnap = Object.freeze(
    [...actions.values()].sort((a, b) => b.sort_order - a.sort_order),
  );
  contextsSnap = Object.freeze(
    [...contexts.values()].sort((a, b) => a.sort_order - b.sort_order),
  );
  projectsSnap = Object.freeze(
    [...projects.values()].sort((a, b) => b.sort_order - a.sort_order),
  );
}

function notify(): void {
  rebuild();
  for (const l of listeners) l();
}

/**
 * Load existing contexts, seeding defaults on first run. PURE with respect to module state —
 * returns rows, never mutates the maps (doInit applies them only after its generation check).
 * Check + write happen in ONE readwrite transaction: IndexedDB serializes overlapping readwrite
 * transactions on the same store across tabs, so two first-run tabs can't double-seed. Seeds are
 * dirty-marked in the same transaction so they reach the backend (canonical ids make every
 * device's seed rows identical — the server upsert merges instead of duplicating).
 */
async function loadOrSeedContexts(db: Awaited<ReturnType<typeof getGtdDB>>): Promise<Context[]> {
  const tx = db.transaction(["contexts", "outbox"], "readwrite");
  const store = tx.objectStore("contexts");
  const existing = await store.getAll();
  if (existing.length > 0) {
    await tx.done;
    return existing;
  }
  const now = nowIso();
  const seeded: Context[] = DEFAULT_CONTEXTS.map((c, i) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    sort_order: i,
    updated_at: now,
  }));
  const outbox = tx.objectStore("outbox");
  await Promise.all([
    ...seeded.map((c) => store.put(c)),
    ...seeded.map((c) =>
      outbox.put({ key: `contexts:${c.id}`, table: "contexts" as const, id: c.id }),
    ),
    tx.done,
  ]);
  return seeded;
}

async function doInit(): Promise<void> {
  if (!isGtdStorageAvailable()) {
    initialized = true;
    return;
  }
  const gen = generation;
  const db = await getGtdDB();
  if (gen !== generation) return; // reset while opening — don't touch anything
  const loaded = await loadOrSeedContexts(db);
  if (gen !== generation) return;
  const [allActions, allProjects] = await Promise.all([
    db.getAll("actions"),
    db.getAll("projects"),
  ]);
  if (gen !== generation) return;
  // All awaits done and generation still current — now (and only now) mutate shared state.
  contexts.clear();
  actions.clear();
  projects.clear();
  for (const c of loaded) contexts.set(c.id, c);
  for (const a of allActions) actions.set(a.id, a);
  for (const p of allProjects) projects.set(p.id, p);
  initChannel();
  initialized = true;
  notify();

  // Backend on → run the background sync loop. (AuthGate only reveals the app with a live
  // session in env-present builds, so a usable auth context exists whenever this runs; a
  // token hiccup just backs off and retries.)
  if (isSupabaseEnabled()) {
    gtdSync.setDelegate({ onAdopted: foldAdoptedChanges });
    gtdSync.start();
  }
}

/** Fold server rows (already durably applied by the engine) into the in-memory view. */
function foldAdoptedChanges(changes: GtdChange[]): void {
  if (!initialized) return; // reset happened mid-flight; reload paths will pick the rows up
  let touched = false;
  for (const change of changes) {
    if (change.table === "contexts") contexts.set(change.row.id, change.row as Context);
    else if (change.table === "projects") projects.set(change.row.id, change.row as Project);
    else if (change.table === "actions") actions.set(change.row.id, change.row as Action);
    else continue; // reference_items aren't held in memory (no list view yet)
    touched = true;
  }
  if (touched) {
    notify();
    broadcast();
  }
}

function ensureInit(): Promise<void> {
  if (initialized) return Promise.resolve();
  if (!initPromise) {
    // Clear the cache on failure so a transient DB error doesn't disable GTD for the session.
    initPromise = doInit().catch((e) => {
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActions(): readonly Action[] {
  useEffect(() => {
    ensureInit().catch(() => {});
  }, []);
  return useSyncExternalStore(subscribe, () => actionsSnap, () => EMPTY_ACTIONS);
}

export function useContexts(): readonly Context[] {
  useEffect(() => {
    ensureInit().catch(() => {});
  }, []);
  return useSyncExternalStore(subscribe, () => contextsSnap, () => EMPTY_CONTEXTS);
}

export function useProjects(): readonly Project[] {
  useEffect(() => {
    ensureInit().catch(() => {});
  }, []);
  return useSyncExternalStore(subscribe, () => projectsSnap, () => EMPTY_PROJECTS);
}

export interface NewAction {
  title: string;
  context_id?: string | null;
  project_id?: string | null;
  status?: ActionStatus;
  is_two_minute?: boolean;
  energy?: Energy | null;
  /** who/what it's on — only meaningful with status "waiting". */
  waiting_on_text?: string | null;
  source_capture_id?: string | null;
}

/**
 * Create an action (or someday item, via status). Returns the action, or null if the durable
 * write couldn't happen — callers must NOT proceed (e.g. must not mark the capture processed).
 * Idempotent per source capture: if a non-dropped action already exists for source_capture_id,
 * it is returned as-is instead of inserting a duplicate (crash-safe re-clarify).
 */
export async function createAction(input: NewAction): Promise<Action | null> {
  const title = input.title.trim();
  if (!title || !isGtdStorageAvailable()) return null;
  const gen = generation;
  try {
    await ensureInit();
    if (gen !== generation) return null;
    const db = await getGtdDB();
    if (gen !== generation) return null;

    if (input.source_capture_id) {
      const existing = await db.getAllFromIndex("actions", "by_source", input.source_capture_id);
      if (gen !== generation) return null;
      const live = existing.find((a) => a.status !== "dropped");
      if (live) return live; // already clarified — idempotent no-op
    }

    const now = nowIso();
    const status = input.status ?? "active";
    const action: Action = {
      id: uuid(),
      title,
      context_id: input.context_id ?? null,
      project_id: input.project_id ?? null,
      status,
      is_two_minute: input.is_two_minute ?? false,
      energy: input.energy ?? null,
      waiting_on_text: status === "waiting" ? input.waiting_on_text?.trim() || null : null,
      waiting_since: status === "waiting" ? now : null,
      source_capture_id: input.source_capture_id ?? null,
      created_at: now,
      updated_at: now,
      sort_order: Date.now(),
    };
    await putRowWithOutbox("actions", action);
    if (gen !== generation) return null; // wiped mid-write — don't republish PII to memory
    actions.set(action.id, action);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return action;
  } catch {
    return null; // durable write failed → nothing shown, caller keeps the capture in the inbox
  }
}

/** Set an action's status. Returns false if the durable write couldn't happen. */
export async function setActionStatus(id: string, status: ActionStatus): Promise<boolean> {
  const cur = actions.get(id);
  if (!cur || cur.status === status) return true;
  const gen = generation;
  try {
    const next: Action = {
      ...cur,
      status,
      // Leaving "waiting" clears the waiting metadata — a resolved Waiting-For isn't on anyone.
      waiting_on_text: status === "waiting" ? cur.waiting_on_text : null,
      waiting_since: status === "waiting" ? cur.waiting_since : null,
      updated_at: nowIso(),
    };
    await putRowWithOutbox("actions", next);
    if (gen !== generation) return false;
    actions.set(id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false; // in-memory untouched (durable-first); UI simply keeps the current state
  }
}

/**
 * Create a project. Same contract as createAction: returns null if the durable write couldn't
 * happen, and is idempotent per source capture (a crash between the project write and the
 * capture status change can't produce duplicates on re-clarify).
 */
export async function createProject(input: {
  title: string;
  source_capture_id?: string | null;
}): Promise<Project | null> {
  const title = input.title.trim();
  if (!title || !isGtdStorageAvailable()) return null;
  const gen = generation;
  try {
    await ensureInit();
    if (gen !== generation) return null;
    const db = await getGtdDB();
    if (gen !== generation) return null;

    if (input.source_capture_id) {
      const existing = await db.getAllFromIndex("projects", "by_source", input.source_capture_id);
      if (gen !== generation) return null;
      const live = existing.find((p) => p.status !== "dropped");
      if (live) return live; // already clarified — idempotent no-op
    }

    const now = nowIso();
    const project: Project = {
      id: uuid(),
      title,
      status: "active",
      source_capture_id: input.source_capture_id ?? null,
      created_at: now,
      updated_at: now,
      sort_order: Date.now(),
    };
    await putRowWithOutbox("projects", project);
    if (gen !== generation) return null;
    projects.set(project.id, project);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return project;
  } catch {
    return null;
  }
}

/** Set a project's status. Returns false if the durable write couldn't happen. */
export async function setProjectStatus(id: string, status: ProjectStatus): Promise<boolean> {
  const cur = projects.get(id);
  if (!cur || cur.status === status) return true;
  const gen = generation;
  try {
    const next: Project = { ...cur, status, updated_at: nowIso() };
    await putRowWithOutbox("projects", next);
    if (gen !== generation) return false;
    projects.set(id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
}

/** Create a reference item. Returns false if the durable write couldn't happen. */
export async function createReference(input: {
  title: string;
  source_capture_id?: string | null;
}): Promise<boolean> {
  const title = input.title.trim();
  if (!title || !isGtdStorageAvailable()) return false;
  const gen = generation;
  try {
    await ensureInit();
    if (gen !== generation) return false;
    const now = nowIso();
    const ref: ReferenceItem = {
      id: uuid(),
      title,
      body: null,
      source_capture_id: input.source_capture_id ?? null,
      created_at: now,
      updated_at: now,
    };
    await putRowWithOutbox("reference_items", ref);
    // References aren't listed yet (a later slice) — no in-memory snapshot to update.
    gtdSync.requestFlush();
    return gen === generation;
  } catch {
    return false;
  }
}

/** Tear down the in-memory view on logout/account-switch (paired with clearGtdData). */
export function resetGtdStore(): void {
  generation++;
  gtdSync.stop(); // quiesce BEFORE the wipe so no in-flight pull writes PII back
  closeChannel();
  contexts.clear();
  actions.clear();
  projects.clear();
  actionsSnap = EMPTY_ACTIONS;
  contextsSnap = EMPTY_CONTEXTS;
  projectsSnap = EMPTY_PROJECTS;
  initialized = false;
  initPromise = null;
  notify();
}

export { clearGtdData, resetGtdDbHandle };
