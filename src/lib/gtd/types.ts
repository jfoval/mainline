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
  /** Soft delete — sync can't hard-delete (LWW would resurrect the row from another device),
   *  so removal is an archived flag that propagates like any other edit. */
  archived: boolean;
  /** LWW clock for sync (newest row wins across devices). */
  updated_at: string;
}

/**
 * GTD's default contexts, seeded on first run. Ids are CANONICAL constants — every device seeds
 * the exact same rows, so cross-device sync merges them instead of duplicating "@home" per device.
 */
export const DEFAULT_CONTEXTS: ReadonlyArray<{
  id: string;
  name: string;
  type: ContextType;
}> = [
  { id: "6fb2a1c0-0000-4000-8000-000000000001", name: "@home", type: "location" },
  { id: "6fb2a1c0-0000-4000-8000-000000000002", name: "@computer", type: "tool" },
  { id: "6fb2a1c0-0000-4000-8000-000000000003", name: "@phone", type: "tool" },
  { id: "6fb2a1c0-0000-4000-8000-000000000004", name: "@errands", type: "location" },
  { id: "6fb2a1c0-0000-4000-8000-000000000005", name: "@online", type: "tool" },
  { id: "6fb2a1c0-0000-4000-8000-000000000006", name: "@anywhere", type: "custom" },
];

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
  /**
   * Tickler (GTD's 43 folders): a LOCAL calendar day, "YYYY-MM-DD" — not a timestamp, because
   * "resurfaces Tuesday morning" means your Tuesday, wherever you are. While it's set the item
   * is off the runway entirely; on the day it reappears in the inbox to be decided fresh
   * (deciding clears the date). Null = no tickler, the normal case.
   */
  resurface_on: string | null;
  /** Free text hung off the item — the thinking, not the doing. Null = none. */
  notes: string | null;
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
  /** Free text hung off the outcome — where a someday item's thinking lands when it grows up
   *  into a project (see promoteToProject). Null = none. */
  notes: string | null;
}

/**
 * Horizons of Focus (FOUNDATIONS §2, the altitude model above Projects). Four plain prose
 * sections, one row each so two devices editing different horizons both keep their work — the
 * ids are CANONICAL constants for the same reason contexts' are: every device writes the same
 * four rows, so sync merges instead of duplicating.
 */
export type HorizonKey = "purpose" | "vision" | "goals" | "areas";

export interface Horizon {
  id: string;
  key: HorizonKey;
  body: string;
  /** LWW clock for sync (newest row wins across devices). */
  updated_at: string;
}

export const HORIZONS: ReadonlyArray<{
  id: string;
  key: HorizonKey;
  title: string;
  hint: string;
}> = [
  {
    id: "8c31d5a0-0000-4000-8000-000000000001",
    key: "purpose",
    title: "Purpose & principles",
    hint: "Why you're here, and the lines you won't cross. 50,000 feet.",
  },
  {
    id: "8c31d5a0-0000-4000-8000-000000000002",
    key: "vision",
    title: "Vision",
    hint: "What wild success looks like in three to five years. 40,000 feet.",
  },
  {
    id: "8c31d5a0-0000-4000-8000-000000000003",
    key: "goals",
    title: "Goals",
    hint: "What you want true within a year or two. 30,000 feet.",
  },
  {
    id: "8c31d5a0-0000-4000-8000-000000000004",
    key: "areas",
    title: "Areas of focus",
    hint: "The standing hats you wear: work, health, family, money. 20,000 feet.",
  },
];

/**
 * One COMPLETED weekly review (DATA-MODEL §review_sessions, trimmed to what the guided flow
 * actually needs). Rows are written once, at the finish line, and never edited — so LWW sync
 * has nothing to resolve and "last reviewed" is simply the newest `completed_at` on the device.
 * In-progress step state stays in React: a review is short, and a half-finished one isn't a fact
 * worth syncing.
 */
export interface ReviewSession {
  id: string;
  started_at: string;
  completed_at: string;
  /** LWW clock for sync (= completed_at; rows are immutable). */
  updated_at: string;
}

/**
 * Non-actionable keep (DATA-MODEL §reference_items) — a POINTER, not a vault. The title is the
 * line you'd tell yourself ("Warranty — Gmail, search Dyson"); the optional link and project tie
 * are the two things worth structuring. The stuff itself stays where it already lives.
 */
export interface ReferenceItem {
  id: string;
  title: string;
  body: string | null;
  /** Optional link to wherever it actually is. */
  url: string | null;
  /** Optional tie to the project it belongs to. */
  project_id: string | null;
  /** Soft delete — same reason as contexts: LWW can't hard-delete across devices. */
  archived: boolean;
  source_capture_id: string | null;
  created_at: string;
  /** LWW clock for sync (newest row wins across devices). */
  updated_at: string;
}
