/**
 * IndexedDB layer for the capture trust spine (via `idb`).
 *
 * Stores:
 *   - captures : materialized client view (keyed by client_id) — what the UI renders.
 *   - oplog    : durable outbound queue of unsynced ops (auto-increment insertion order).
 *   - server   : simulated authoritative server (LocalOnlyAdapter only). The SupabaseAdapter
 *                replaces this with real Postgres; nothing else in the app changes.
 *   - meta     : counters (e.g. the server_seq allocator) + small key/number state.
 *
 * Everything here is browser-only. Callers in React components must be client components.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Capture, CaptureOp, ServerCapture } from "./types";

const DB_NAME = "gtd-capture";
const DB_VERSION = 1;

interface MetaRow {
  key: string;
  value: number;
}

interface CaptureDBSchema extends DBSchema {
  captures: {
    key: string;
    value: Capture;
    indexes: { by_server_seq: number; by_status: string };
  };
  oplog: {
    // out-of-line auto-increment key == global insertion order (== flush order)
    key: number;
    value: CaptureOp;
    indexes: { by_client: string };
  };
  server: {
    key: string;
    value: ServerCapture;
    indexes: { by_server_seq: number };
  };
  meta: {
    key: string;
    value: MetaRow;
  };
}

export type CaptureDB = IDBPDatabase<CaptureDBSchema>;

let dbPromise: Promise<CaptureDB> | null = null;

/** Open (and memoize) the database. Browser-only — throws if IndexedDB is unavailable. */
export function getDB(): Promise<CaptureDB> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable (server or unsupported browser)"));
  }
  if (!dbPromise) {
    dbPromise = openDB<CaptureDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const captures = db.createObjectStore("captures", { keyPath: "client_id" });
        captures.createIndex("by_server_seq", "server_seq");
        captures.createIndex("by_status", "status");

        const oplog = db.createObjectStore("oplog", { autoIncrement: true });
        oplog.createIndex("by_client", "client_id");

        const server = db.createObjectStore("server", { keyPath: "client_id" });
        server.createIndex("by_server_seq", "server_seq");

        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

export function isCaptureStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * Atomically: persist the optimistic materialized capture AND enqueue its op, in one
 * transaction. This closes the "shown but not queued / queued but not shown" gap that
 * would otherwise let a capture be silently lost.
 */
export async function commitLocalOp(capture: Capture, op: CaptureOp): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["captures", "oplog"], "readwrite");
  await Promise.all([
    tx.objectStore("captures").put(capture),
    tx.objectStore("oplog").add(op),
    tx.done,
  ]);
}

export async function getAllCaptures(): Promise<Capture[]> {
  const db = await getDB();
  return db.getAll("captures");
}

export async function getCapture(clientId: string): Promise<Capture | undefined> {
  const db = await getDB();
  return db.get("captures", clientId);
}

export async function putCapture(capture: Capture): Promise<void> {
  const db = await getDB();
  await db.put("captures", capture);
}

/** Distinct client_ids that still have unsynced ops in the queue. */
export async function pendingClientIds(): Promise<Set<string>> {
  const db = await getDB();
  const ops = await db.getAll("oplog");
  return new Set(ops.map((o) => o.client_id));
}

export async function pendingOpCount(): Promise<number> {
  const db = await getDB();
  return db.count("oplog");
}

/** Wipe every store — used on logout / account-switch (shared-device PII). */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["captures", "oplog", "server", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("captures").clear(),
    tx.objectStore("oplog").clear(),
    tx.objectStore("server").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
}

/** Close and forget the memoized handle so the next account opens a truly fresh db. */
export async function resetDbHandle(): Promise<void> {
  if (!dbPromise) return;
  const pending = dbPromise;
  dbPromise = null;
  try {
    (await pending).close();
  } catch {
    // already closed / failed to open — nothing to do
  }
}

/**
 * Atomically fold a server ack into one materialized capture. Reads the CURRENT row and the
 * live pending-op count inside a single readwrite transaction, hands them to `merge`, and
 * writes the result back in the same tx — so a concurrent optimistic edit (committed via
 * commitLocalOp) can never be clobbered by a stale read, and `client_seq` can never regress.
 * `merge` returns null to skip the write (no meaningful change). Returns the written row.
 */
export async function reconcileCapture(
  clientId: string,
  merge: (local: Capture, pending: boolean) => Capture | null,
): Promise<Capture | null> {
  const db = await getDB();
  const tx = db.transaction(["captures", "oplog"], "readwrite");
  const local = await tx.objectStore("captures").get(clientId);
  if (!local) {
    await tx.done;
    return null;
  }
  const pendingCount = await tx.objectStore("oplog").index("by_client").count(clientId);
  const next = merge(local, pendingCount > 0);
  if (next) await tx.objectStore("captures").put(next);
  await tx.done;
  return next;
}
