/**
 * GTD "organize" domain (DATA-MODEL.md §actions/contexts) — the output of Clarify.
 *
 * Phase 2 (manual engine) is local-first, like capture was before its backend: these live in
 * IndexedDB and work fully offline with AI off. Sync + the full clarification_items provenance
 * join arrive later (they mirror how captures got a backend in Phase 1 step 5). For the manual,
 * single-item clarify we keep a lightweight `source_capture_id` link instead of that join.
 */

/** actions.status (DATA-MODEL §actions). Phase-2 manual engine uses active/someday/done/dropped;
 *  `waiting`/`scheduled` land with Waiting-For + calendar. */
export type ActionStatus = "active" | "waiting" | "someday" | "done" | "dropped";

export type Energy = "low" | "medium" | "high";

/** contexts.type (DATA-MODEL §contexts). */
export type ContextType = "tool" | "location" | "person" | "energy" | "custom";

export interface Context {
  id: string;
  /** "@computer", "@home", … */
  name: string;
  type: ContextType;
  sort_order: number;
}

/** A next action — the thing you actually DO (DATA-MODEL §actions). Title is verb-first. */
export interface Action {
  id: string;
  title: string;
  context_id: string | null;
  /** Projects land in slice 2; nullable standalone action for now. */
  project_id: string | null;
  status: ActionStatus;
  /** 2-minute rule — engage/next views surface "do it now". */
  is_two_minute: boolean;
  energy: Energy | null;
  /** lineage back to the inbox capture this was clarified from. */
  source_capture_id: string | null;
  created_at: string;
  updated_at: string;
  /** stable list ordering. */
  sort_order: number;
}

/** Non-actionable keep (DATA-MODEL §reference_items). Minimal for the manual engine. */
export interface ReferenceItem {
  id: string;
  title: string;
  body: string | null;
  source_capture_id: string | null;
  created_at: string;
}
