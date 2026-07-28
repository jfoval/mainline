"use client";

/**
 * IndexedDB for the GTD organize domain (actions / projects / contexts / references) plus its
 * sync bookkeeping. Separate DB from the capture spine — clarify writes here; the capture's own
 * status change syncs via the capture op-log. Browser-only.
 *
 * Sync model (v4): whole-row last-write-wins with a durable outbox.
 *   - Every row carries `updated_at` (the LWW clock). Every local write puts the row AND its
 *     outbox entry in ONE transaction, so a crash can never strand an unsynced edit.
 *   - `meta.gtd_last_seq` is the incremental-pull watermark (server_seq high-water mark).
 *   - Server rows are adopted only when strictly newer (sync-merge.ts) — echoes of our own
 *     pushes are no-ops, and a dirty local row survives until its own push wins.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { normalizeIso, shouldAdopt } from "./sync-merge";
import { DEFAULT_CONTEXTS, type Action, type Context, type Project, type ReferenceItem } from "./types";

const DB_NAME = "gtd-organize";
const DB_VERSION = 5;

/** Server-side table names. The references store predates the server naming — map via STORE_OF. */
export type GtdTable = "contexts" | "projects" | "actions" | "reference_items";
export type GtdRow = Action | Project | Context | ReferenceItem;

const STORE_OF = {
  contexts: "contexts",
  projects: "projects",
  actions: "actions",
  reference_items: "references",
} as const;
type GtdStoreName = (typeof STORE_OF)[GtdTable];

export interface GtdChange {
  table: GtdTable;
  row: GtdRow;
}

interface OutboxEntry {
  /** `${table}:${id}` — one entry per dirty row, latest state always read at flush time. */
  key: string;
  table: GtdTable;
  id: string;
}

interface GtdDBSchema extends DBSchema {
  actions: {
    key: string;
    value: Action;
    indexes: { by_status: string; by_source: string };
  };
  contexts: { key: string; value: Context };
  references: { key: string; value: ReferenceItem };
  projects: {
    key: string;
    value: Project;
    indexes: { by_source: string };
  };
  outbox: { key: string; value: OutboxEntry };
  meta: { key: string; value: { key: string; value: unknown } };
}

export type GtdDB = IDBPDatabase<GtdDBSchema>;

let dbPromise: Promise<GtdDB> | null = null;

export function getGtdDB(): Promise<GtdDB> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable (server or unsupported browser)"));
  }
  if (!dbPromise) {
    dbPromise = openDB<GtdDBSchema>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const actions = db.createObjectStore("actions", { keyPath: "id" });
          actions.createIndex("by_status", "status");
          db.createObjectStore("contexts", { keyPath: "id" });
          db.createObjectStore("references", { keyPath: "id" });
        }
        if (oldVersion < 2) {
          // by_source: lineage lookup for idempotent clarify (one action per source capture).
          tx.objectStore("actions").createIndex("by_source", "source_capture_id");
        }
        if (oldVersion < 3) {
          const projects = db.createObjectStore("projects", { keyPath: "id" });
          projects.createIndex("by_source", "source_capture_id");
          // Backfill the new nullable waiting fields so pre-v3 rows read as valid Actions.
          let cur = await tx.objectStore("actions").openCursor();
          while (cur) {
            await cur.update({
              ...cur.value,
              waiting_on_text: cur.value.waiting_on_text ?? null,
              waiting_since: cur.value.waiting_since ?? null,
            });
            cur = await cur.continue();
          }
        }
        if (oldVersion < 4) {
          const outbox = db.createObjectStore("outbox", { keyPath: "key" });
          db.createObjectStore("meta", { keyPath: "key" });

          // (a) Give contexts/references their LWW clock. Epoch for legacy contexts (any real
          // edit anywhere wins over an untouched seed); created_at for references.
          const EPOCH = "1970-01-01T00:00:00.000Z";
          const ctxStore = tx.objectStore("contexts");
          const refStore = tx.objectStore("references");

          // (b) Remap pre-v4 randomly-seeded default contexts to their canonical ids so every
          // device converges on identical rows (see DEFAULT_CONTEXTS). Actions follow.
          const canonicalByName = new Map(DEFAULT_CONTEXTS.map((c) => [c.name, c.id]));
          const remap = new Map<string, string>();
          for (const c of await ctxStore.getAll()) {
            const canonical = canonicalByName.get(c.name);
            if (canonical && c.id !== canonical) {
              remap.set(c.id, canonical);
              await ctxStore.delete(c.id);
              if (!(await ctxStore.get(canonical))) {
                await ctxStore.put({ ...c, id: canonical, updated_at: c.updated_at ?? EPOCH });
              }
            } else {
              await ctxStore.put({ ...c, updated_at: c.updated_at ?? EPOCH });
            }
          }
          let ref = await refStore.openCursor();
          while (ref) {
            await ref.update({ ...ref.value, updated_at: ref.value.updated_at ?? ref.value.created_at });
            ref = await ref.continue();
          }
          let act = await tx.objectStore("actions").openCursor();
          while (act) {
            const mapped = act.value.context_id ? remap.get(act.value.context_id) : undefined;
            if (mapped) await act.update({ ...act.value, context_id: mapped });
            act = await act.continue();
          }

          // (c) Everything that exists locally predates sync — queue it all for the first push.
          const seed: Array<[GtdTable, GtdStoreName]> = [
            ["contexts", "contexts"],
            ["projects", "projects"],
            ["actions", "actions"],
            ["reference_items", "references"],
          ];
          for (const [table, storeName] of seed) {
            for (const id of await tx.objectStore(storeName).getAllKeys()) {
              await outbox.put({ key: `${table}:${id}`, table, id });
            }
          }
        }
        if (oldVersion < 5) {
          // Contexts become user-editable; archived = soft delete (see types.ts). Backfill false.
          let cur = await tx.objectStore("contexts").openCursor();
          while (cur) {
            await cur.update({ ...cur.value, archived: cur.value.archived ?? false });
            cur = await cur.continue();
          }
        }
      },
    });
  }
  return dbPromise;
}

export function isGtdStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

// ───────────────────────────── sync bookkeeping ─────────────────────────────

/** Durable write + dirty-mark in ONE transaction (the no-stranded-edit invariant). */
export async function putRowWithOutbox(table: GtdTable, row: GtdRow): Promise<void> {
  const db = await getGtdDB();
  const storeName = STORE_OF[table];
  const tx = db.transaction([storeName, "outbox"], "readwrite");
  // The union value type defeats idb's per-store typing here; the (table, row) pairing is
  // enforced by every caller passing its own concrete type.
  await Promise.all([
    tx.objectStore(storeName).put(row as never),
    tx.objectStore("outbox").put({ key: `${table}:${row.id}`, table, id: row.id }),
    tx.done,
  ]);
}

/** Snapshot the dirty set with each row's CURRENT state, in one read transaction. */
export async function readOutbox(): Promise<{
  changes: GtdChange[];
  /** updated_at per outbox key at snapshot time — used to clear only unchanged rows after push. */
  stamps: Map<string, string>;
}> {
  const db = await getGtdDB();
  const tx = db.transaction(["outbox", "contexts", "projects", "actions", "references"], "readonly");
  const entries = await tx.objectStore("outbox").getAll();
  const changes: GtdChange[] = [];
  const stamps = new Map<string, string>();
  for (const e of entries) {
    const row = (await tx.objectStore(STORE_OF[e.table]).get(e.id)) as GtdRow | undefined;
    if (!row) {
      stamps.set(e.key, ""); // row vanished (shouldn't happen) — clearable
      continue;
    }
    changes.push({ table: e.table, row });
    stamps.set(e.key, row.updated_at);
  }
  await tx.done;
  return { changes, stamps };
}

/** After a successful push: drop outbox entries whose row is unchanged since the snapshot.
 *  A row edited mid-flight keeps its entry and rides the next flush. */
export async function clearOutboxIfUnchanged(stamps: Map<string, string>): Promise<void> {
  if (stamps.size === 0) return;
  const db = await getGtdDB();
  const tx = db.transaction(["outbox", "contexts", "projects", "actions", "references"], "readwrite");
  const outbox = tx.objectStore("outbox");
  for (const [key, sentStamp] of stamps) {
    const entry = await outbox.get(key);
    if (!entry) continue;
    const row = (await tx.objectStore(STORE_OF[entry.table]).get(entry.id)) as GtdRow | undefined;
    if (!row || row.updated_at === sentStamp) await outbox.delete(key);
  }
  await tx.done;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getGtdDB();
  const rec = await db.get("meta", key);
  return rec?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getGtdDB();
  await db.put("meta", { key, value });
}

/**
 * Fold pulled server rows into the local stores (one transaction, LWW per row, no outbox marks —
 * adopted rows are the server's state, not new local edits). Returns the changes actually
 * adopted so the in-memory view can fold the same set. Timestamps are normalized to the
 * client's "…Z" form on the way in.
 */
export async function applyServerChanges(changes: GtdChange[]): Promise<GtdChange[]> {
  if (changes.length === 0) return [];
  const db = await getGtdDB();
  const tx = db.transaction(["contexts", "projects", "actions", "references"], "readwrite");
  const adopted: GtdChange[] = [];
  for (const change of changes) {
    const storeName = STORE_OF[change.table];
    const incoming = normalizeRow(change);
    const local = (await tx.objectStore(storeName).get(incoming.row.id)) as GtdRow | undefined;
    if (!shouldAdopt(local?.updated_at, incoming.row.updated_at)) continue;
    await tx.objectStore(storeName).put(incoming.row as never);
    adopted.push(incoming);
  }
  await tx.done;
  return adopted;
}

/** Normalize a server row's timestamp strings to the client's canonical ISO form. */
function normalizeRow({ table, row }: GtdChange): GtdChange {
  const r = { ...row, updated_at: normalizeIso(row.updated_at) } as GtdRow;
  if ("created_at" in r) r.created_at = normalizeIso(r.created_at);
  if (table === "actions") {
    const a = r as Action;
    a.waiting_since = normalizeIso(a.waiting_since);
  }
  return { table, row: r };
}

/** Wipe every store — part of logout / account-switch PII clearing (paired with clearLocalData).
 *  Includes outbox + meta so the next account starts with a clean queue and a zero watermark. */
export async function clearGtdData(): Promise<void> {
  const db = await getGtdDB();
  const tx = db.transaction(
    ["actions", "contexts", "references", "projects", "outbox", "meta"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("actions").clear(),
    tx.objectStore("contexts").clear(),
    tx.objectStore("references").clear(),
    tx.objectStore("projects").clear(),
    tx.objectStore("outbox").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
}

export async function resetGtdDbHandle(): Promise<void> {
  if (!dbPromise) return;
  const pending = dbPromise;
  dbPromise = null;
  try {
    (await pending).close();
  } catch {
    // already closed / failed to open
  }
}
