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
import { normalizeUrl } from "@/lib/url";
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
  HORIZONS,
  type Action,
  type ActionStatus,
  type Context,
  type Energy,
  type Horizon,
  type HorizonKey,
  type Project,
  type ProjectStatus,
  type ReferenceItem,
  type ReviewSession,
} from "./types";

const contexts = new Map<string, Context>();
const actions = new Map<string, Action>();
const projects = new Map<string, Project>();
const reviews = new Map<string, ReviewSession>();
const references = new Map<string, ReferenceItem>();
const horizons = new Map<string, Horizon>();
const listeners = new Set<() => void>();

const EMPTY_ACTIONS: readonly Action[] = Object.freeze([]);
const EMPTY_CONTEXTS: readonly Context[] = Object.freeze([]);
const EMPTY_PROJECTS: readonly Project[] = Object.freeze([]);
const EMPTY_REFERENCES: readonly ReferenceItem[] = Object.freeze([]);
const EMPTY_HORIZONS: Readonly<Record<HorizonKey, string>> = Object.freeze({
  purpose: "",
  vision: "",
  goals: "",
  areas: "",
});
/** Horizon bodies by key — a plain record so the four sections read as one value. */
let horizonsSnap: Readonly<Record<HorizonKey, string>> = EMPTY_HORIZONS;
const EMPTY_COMPLETIONS: readonly string[] = Object.freeze([]);
let completionsSnap: readonly string[] = EMPTY_COMPLETIONS;
let referencesSnap: readonly ReferenceItem[] = EMPTY_REFERENCES;
let actionsSnap: readonly Action[] = EMPTY_ACTIONS;
/** Active (non-archived) contexts — what every picker and list shows. */
let contextsSnap: readonly Context[] = EMPTY_CONTEXTS;
let projectsSnap: readonly Project[] = EMPTY_PROJECTS;
/** Newest completed review's timestamp (null = never reviewed) — a scalar, so the
 *  useSyncExternalStore snapshot is stable without freezing an array. */
let lastReviewedSnap: string | null = null;

/** Seeds carry the EPOCH clock: a fresh device re-seeding defaults must never win LWW against a
 *  real edit synced from another device (e.g. a rename or archive of "@home"). */
const SEED_UPDATED_AT = "1970-01-01T00:00:00.000Z";

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
    const [allContexts, allActions, allProjects, allReviews, allReferences, allHorizons] =
      await Promise.all([
        db.getAll("contexts"),
        db.getAll("actions"),
        db.getAll("projects"),
        db.getAll("review_sessions"),
        db.getAll("references"),
        db.getAll("horizons"),
      ]);
    if (gen !== generation) return;
    contexts.clear();
    actions.clear();
    projects.clear();
    reviews.clear();
    references.clear();
    horizons.clear();
    for (const c of allContexts) contexts.set(c.id, c);
    for (const a of allActions) actions.set(a.id, a);
    for (const p of allProjects) projects.set(p.id, p);
    for (const r of allReviews) reviews.set(r.id, r);
    for (const r of allReferences) references.set(r.id, r);
    for (const h of allHorizons) horizons.set(h.id, h);
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
    [...contexts.values()]
      .filter((c) => !c.archived)
      .sort((a, b) => a.sort_order - b.sort_order),
  );
  projectsSnap = Object.freeze(
    [...projects.values()].sort((a, b) => b.sort_order - a.sort_order),
  );
  referencesSnap = Object.freeze(
    [...references.values()]
      .filter((r) => !r.archived)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );
  const bodies: Record<HorizonKey, string> = { purpose: "", vision: "", goals: "", areas: "" };
  for (const h of horizons.values()) {
    if (h.key in bodies) bodies[h.key] = h.body;
  }
  horizonsSnap = Object.freeze(bodies);
  let latest: string | null = null;
  for (const r of reviews.values()) {
    // Date.parse (not string compare): a row pulled from another device could carry a
    // differently-formatted-but-equivalent timestamp. An unparseable one just never wins.
    if (!latest || Date.parse(r.completed_at) > Date.parse(latest)) latest = r.completed_at;
  }
  lastReviewedSnap = latest;
  completionsSnap = Object.freeze([...reviews.values()].map((r) => r.completed_at));
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
  const seeded: Context[] = DEFAULT_CONTEXTS.map((c, i) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    sort_order: i,
    archived: false,
    updated_at: SEED_UPDATED_AT,
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
  const [allActions, allProjects, allReviews, allReferences, allHorizons] = await Promise.all([
    db.getAll("actions"),
    db.getAll("projects"),
    db.getAll("review_sessions"),
    db.getAll("references"),
    db.getAll("horizons"),
  ]);
  if (gen !== generation) return;
  // All awaits done and generation still current — now (and only now) mutate shared state.
  contexts.clear();
  actions.clear();
  projects.clear();
  reviews.clear();
  references.clear();
  horizons.clear();
  for (const c of loaded) contexts.set(c.id, c);
  for (const a of allActions) actions.set(a.id, a);
  for (const p of allProjects) projects.set(p.id, p);
  for (const r of allReviews) reviews.set(r.id, r);
  for (const r of allReferences) references.set(r.id, r);
  for (const h of allHorizons) horizons.set(h.id, h);
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
    else if (change.table === "review_sessions")
      reviews.set(change.row.id, change.row as ReviewSession);
    else if (change.table === "reference_items")
      references.set(change.row.id, change.row as ReferenceItem);
    else if (change.table === "horizons") horizons.set(change.row.id, change.row as Horizon);
    else continue;
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

/** The four horizon bodies, keyed (missing ones read as ""). */
export function useHorizons(): Readonly<Record<HorizonKey, string>> {
  useEffect(() => {
    ensureInit().catch(() => {});
  }, []);
  return useSyncExternalStore(subscribe, () => horizonsSnap, () => EMPTY_HORIZONS);
}

/**
 * Write one horizon. The row is created on first edit with the CANONICAL id for that key, so
 * two devices writing "purpose" for the first time converge on one row instead of two.
 */
export async function setHorizon(key: HorizonKey, body: string): Promise<boolean> {
  const spec = HORIZONS.find((h) => h.key === key);
  if (!spec || !isGtdStorageAvailable()) return false;
  const gen = generation;
  try {
    await ensureInit();
    if (gen !== generation) return false;
    const next: Horizon = { id: spec.id, key, body: body.trim(), updated_at: nowIso() };
    await putRowWithOutbox("horizons", next);
    if (gen !== generation) return false;
    horizons.set(next.id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
}

/** Every completed review's timestamp — the review flow uses it for its monthly cadence. */
export function useReviewCompletions(): readonly string[] {
  useEffect(() => {
    ensureInit().catch(() => {});
  }, []);
  return useSyncExternalStore(subscribe, () => completionsSnap, () => EMPTY_COMPLETIONS);
}

/** When the last weekly review was completed on ANY of your devices (null = never). */
export function useLastReviewedAt(): string | null {
  useEffect(() => {
    ensureInit().catch(() => {});
  }, []);
  return useSyncExternalStore(subscribe, () => lastReviewedSnap, () => null);
}

/**
 * Stamp a completed weekly review. Write-once row (see ReviewSession) — so there is no edit
 * path, no conflict to resolve, and a review completed offline still lands when sync catches up.
 * Returns false if the durable write couldn't happen (the flow then says so rather than
 * claiming a review that isn't recorded).
 */
export async function completeReview(startedAt: string): Promise<boolean> {
  if (!isGtdStorageAvailable()) return false;
  const gen = generation;
  try {
    await ensureInit();
    if (gen !== generation) return false;
    const now = nowIso();
    const session: ReviewSession = {
      id: uuid(),
      started_at: startedAt,
      completed_at: now,
      updated_at: now,
    };
    await putRowWithOutbox("review_sessions", session);
    if (gen !== generation) return false;
    reviews.set(session.id, session);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
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
  /** local "YYYY-MM-DD" — hides the item until that day (see Action.resurface_on). */
  resurface_on?: string | null;
  notes?: string | null;
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
      resurface_on: input.resurface_on ?? null,
      notes: input.notes?.trim() || null,
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

/**
 * Set (or clear, with null) an action's tickler date — a local "YYYY-MM-DD" day. Optionally
 * changes the status in the SAME write, so "not now, ask me in a month" is one row version
 * rather than two racing edits. Returns false if the durable write couldn't happen.
 */
export async function setResurfaceDate(
  id: string,
  date: string | null,
  status?: ActionStatus,
): Promise<boolean> {
  const cur = actions.get(id);
  if (!cur) return false;
  const gen = generation;
  try {
    const nextStatus = status ?? cur.status;
    const next: Action = {
      ...cur,
      resurface_on: date,
      status: nextStatus,
      // Same rule as setActionStatus: leaving "waiting" drops the waiting metadata.
      waiting_on_text: nextStatus === "waiting" ? cur.waiting_on_text : null,
      waiting_since: nextStatus === "waiting" ? cur.waiting_since : null,
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
    return false;
  }
}

/** Set (or clear, with empty) an action's notes. Returns false on write failure. */
export async function setActionNotes(id: string, notes: string): Promise<boolean> {
  const cur = actions.get(id);
  if (!cur) return false;
  const gen = generation;
  try {
    const next: Action = { ...cur, notes: notes.trim() || null, updated_at: nowIso() };
    await putRowWithOutbox("actions", next);
    if (gen !== generation) return false;
    actions.set(id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
}

/** Set (or clear, with empty) a project's notes. Returns false on write failure. */
export async function setProjectNotes(id: string, notes: string): Promise<boolean> {
  const cur = projects.get(id);
  if (!cur) return false;
  const gen = generation;
  try {
    const next: Project = { ...cur, notes: notes.trim() || null, updated_at: nowIso() };
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

/**
 * Grow a someday item into a project: its title becomes the outcome, its notes come along, and
 * the first next action is created with it (nothing here is ever born stalled). The original
 * item is dropped — not deleted — so Undo can put the whole thing back.
 *
 * Order matters: project → action → drop the source. Every step is durable-before-publish, and
 * a failure part-way leaves the someday item exactly where it was, so a retry is safe.
 */
export async function promoteToProject(input: {
  actionId: string;
  outcome: string;
  firstAction: string;
  contextId?: string | null;
}): Promise<{ project: Project; firstAction: Action } | null> {
  const source = actions.get(input.actionId);
  if (!source) return null;
  const project = await createProject({ title: input.outcome, notes: source.notes });
  if (!project) return null;
  const first = await createAction({
    title: input.firstAction,
    context_id: input.contextId ?? null,
    project_id: project.id,
  });
  if (!first) return null;
  const ok = await setActionStatus(input.actionId, "dropped");
  return ok ? { project, firstAction: first } : null;
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
      // A deliberate status decision supersedes a pending tickler date (setResurfaceDate is the
      // path that sets both together). Undo restores the whole prior row, date included.
      resurface_on: null,
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
 * Create a context. Returns the existing active context when the (case-insensitive) name is
 * already taken — "add @home twice" merges instead of duplicating. Null on write failure.
 */
export async function createContext(name: string): Promise<Context | null> {
  const trimmed = name.trim();
  if (!trimmed || !isGtdStorageAvailable()) return null;
  const gen = generation;
  try {
    await ensureInit();
    if (gen !== generation) return null;
    const existing = [...contexts.values()].find(
      (c) => !c.archived && c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return existing;
    const context: Context = {
      id: uuid(),
      name: trimmed,
      type: "custom",
      sort_order: Math.max(0, ...[...contexts.values()].map((c) => c.sort_order)) + 1,
      archived: false,
      updated_at: nowIso(),
    };
    await putRowWithOutbox("contexts", context);
    if (gen !== generation) return null;
    contexts.set(context.id, context);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return context;
  } catch {
    return null;
  }
}

/** Rename a context. Returns false on write failure. */
export async function renameContext(id: string, name: string): Promise<boolean> {
  const cur = contexts.get(id);
  const trimmed = name.trim();
  if (!cur || !trimmed || cur.name === trimmed) return cur != null;
  const gen = generation;
  try {
    const next: Context = { ...cur, name: trimmed, updated_at: nowIso() };
    await putRowWithOutbox("contexts", next);
    if (gen !== generation) return false;
    contexts.set(id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
}

/** Archive (soft-delete) a context — its actions fold into "No context", nothing is lost. */
export async function archiveContext(id: string): Promise<boolean> {
  const cur = contexts.get(id);
  if (!cur || cur.archived) return cur != null;
  const gen = generation;
  try {
    const next: Context = { ...cur, archived: true, updated_at: nowIso() };
    await putRowWithOutbox("contexts", next);
    if (gen !== generation) return false;
    contexts.set(id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
}

/** Put back a prior snapshot of a context (the Undo path for archive). */
export async function restoreContext(prev: Context): Promise<boolean> {
  const gen = generation;
  try {
    const next: Context = { ...prev, updated_at: nowIso() };
    await putRowWithOutbox("contexts", next);
    if (gen !== generation) return false;
    contexts.set(next.id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
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
  notes?: string | null;
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
      notes: input.notes?.trim() || null,
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

/** Rename a project (title IS the outcome statement). Returns false on write failure. */
export async function updateProjectTitle(id: string, title: string): Promise<boolean> {
  const cur = projects.get(id);
  const trimmed = title.trim();
  if (!cur || !trimmed || cur.title === trimmed) return cur != null;
  const gen = generation;
  try {
    const next: Project = { ...cur, title: trimmed, updated_at: nowIso() };
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

/**
 * Put back a prior snapshot of an action (the Undo path — restores EVERY field, e.g. the
 * waiting metadata that a status change cleared). Fresh updated_at so the restore wins LWW.
 */
export async function restoreAction(prev: Action): Promise<boolean> {
  const gen = generation;
  try {
    const next: Action = { ...prev, updated_at: nowIso() };
    await putRowWithOutbox("actions", next);
    if (gen !== generation) return false;
    actions.set(next.id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
}

/** Put back a prior snapshot of a project (the Undo path). */
export async function restoreProject(prev: Project): Promise<boolean> {
  const gen = generation;
  try {
    const next: Project = { ...prev, updated_at: nowIso() };
    await putRowWithOutbox("projects", next);
    if (gen !== generation) return false;
    projects.set(next.id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
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

/** The reference index — pointers to where things live, newest first. */
export function useReferences(): readonly ReferenceItem[] {
  useEffect(() => {
    ensureInit().catch(() => {});
  }, []);
  return useSyncExternalStore(subscribe, () => referencesSnap, () => EMPTY_REFERENCES);
}

/** Create a reference item. Returns false if the durable write couldn't happen. */
export async function createReference(input: {
  title: string;
  url?: string | null;
  project_id?: string | null;
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
      // A link typed without a scheme is a RELATIVE href — normalize before it's stored.
      url: normalizeUrl(input.url),
      project_id: input.project_id ?? null,
      archived: false,
      source_capture_id: input.source_capture_id ?? null,
      created_at: now,
      updated_at: now,
    };
    await putRowWithOutbox("reference_items", ref);
    if (gen !== generation) return false;
    references.set(ref.id, ref);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
}

/** Edit a reference (any of the three fields). Returns false on write failure. */
export async function updateReference(
  id: string,
  patch: { title?: string; url?: string | null; project_id?: string | null },
): Promise<boolean> {
  const cur = references.get(id);
  if (!cur) return false;
  const title = patch.title?.trim() ?? cur.title;
  if (!title) return false;
  const gen = generation;
  try {
    const next: ReferenceItem = {
      ...cur,
      title,
      url: patch.url === undefined ? cur.url : normalizeUrl(patch.url),
      project_id: patch.project_id === undefined ? cur.project_id : patch.project_id,
      updated_at: nowIso(),
    };
    await putRowWithOutbox("reference_items", next);
    if (gen !== generation) return false;
    references.set(id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
  } catch {
    return false;
  }
}

/** Archive (soft-delete) a reference — sync can't hard-delete, so removal is a flag. */
export async function archiveReference(id: string): Promise<boolean> {
  const cur = references.get(id);
  if (!cur || cur.archived) return cur != null;
  return writeReference({ ...cur, archived: true });
}

/** Put back a prior snapshot of a reference (the Undo path for archive). */
export async function restoreReference(prev: ReferenceItem): Promise<boolean> {
  return writeReference(prev);
}

async function writeReference(row: ReferenceItem): Promise<boolean> {
  const gen = generation;
  try {
    const next: ReferenceItem = { ...row, updated_at: nowIso() };
    await putRowWithOutbox("reference_items", next);
    if (gen !== generation) return false;
    references.set(next.id, next);
    notify();
    broadcast();
    gtdSync.requestFlush();
    return true;
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
  reviews.clear();
  references.clear();
  horizons.clear();
  actionsSnap = EMPTY_ACTIONS;
  contextsSnap = EMPTY_CONTEXTS;
  projectsSnap = EMPTY_PROJECTS;
  referencesSnap = EMPTY_REFERENCES;
  horizonsSnap = EMPTY_HORIZONS;
  completionsSnap = EMPTY_COMPLETIONS;
  lastReviewedSnap = null;
  initialized = false;
  initPromise = null;
  notify();
}

export { clearGtdData, resetGtdDbHandle };
