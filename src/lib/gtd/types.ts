/**
 * GTD "organize" domain (DATA-MODEL.md §actions/contexts) — the output of Clarify.
 *
 * Phase 2 (manual engine) is local-first, like capture was before its backend: these live in
 * IndexedDB and work fully offline with AI off. Sync + the full clarification_items provenance
 * join arrive later (they mirror how captures got a backend in Phase 1 step 5). For the manual,
 * single-item clarify we keep a lightweight `source_capture_id` link instead of that join.
 */

/** actions.status (DATA-MODEL §actions). `scheduled` lands with calendar. */
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
  /** null = standalone action (no project). */
  project_id: string | null;
  status: ActionStatus;
  /** 2-minute rule — engage/next views surface "do it now". */
  is_two_minute: boolean;
  energy: Energy | null;
  /** Waiting-For (status="waiting"): who/what it's delegated to or blocked on. */
  waiting_on_text: string | null;
  /** when it entered waiting — the aging anchor for the Waiting-For list. */
  waiting_since: string | null;
  /** lineage back to the inbox capture this was clarified from. */
  source_capture_id: string | null;
  created_at: string;
  updated_at: string;
  /** stable list ordering. */
  sort_order: number;
}

/** projects.status (DATA-MODEL §projects). Manual slice uses these three;
 *  someday/on_hold arrive with the weekly review. */
export type ProjectStatus = "active" | "completed" | "dropped";

/** An outcome needing more than one action (DATA-MODEL §projects, Horizon 10k). */
export interface Project {
  id: string;
  /** The outcome, stated as done ("Maui trip booked"). */
  title: string;
  status: ProjectStatus;
  /** lineage back to the inbox capture this was clarified from. */
  source_capture_id: string | null;
  created_at: string;
  updated_at: string;
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
