"use client";

/**
 * IndexedDB for the GTD organize domain (actions / contexts / references). Separate DB from the
 * capture spine — clarify writes here; the capture's own status change syncs via the capture
 * op-log. Browser-only.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Action, Context, Project, ReferenceItem } from "./types";

const DB_NAME = "gtd-organize";
const DB_VERSION = 3;

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
      },
    });
  }
  return dbPromise;
}

export function isGtdStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Wipe every store — part of logout / account-switch PII clearing (paired with clearLocalData). */
export async function clearGtdData(): Promise<void> {
  const db = await getGtdDB();
  const tx = db.transaction(["actions", "contexts", "references", "projects"], "readwrite");
  await Promise.all([
    tx.objectStore("actions").clear(),
    tx.objectStore("contexts").clear(),
    tx.objectStore("references").clear(),
    tx.objectStore("projects").clear(),
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
