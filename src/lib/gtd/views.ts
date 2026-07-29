/**
 * Pure view logic for the organize lists (kept out of components so it's unit-testable).
 */
import type { Action, Project } from "./types";

/** An action still counts toward its project's momentum while active OR waiting. */
function isActionable(a: Action): boolean {
  return a.status === "active" || a.status === "waiting";
}

/**
 * GTD's cardinal rule: an active project with no actionable item is stalled and must be
 * surfaced — name the next action or complete the project. (DATA-MODEL §projects invariant;
 * derived live from the actions list rather than stored, so it can never go stale.)
 */
export function projectNeedsNextAction(project: Project, actions: readonly Action[]): boolean {
  if (project.status !== "active") return false;
  return !actions.some((a) => a.project_id === project.id && isActionable(a));
}

/**
 * The project's current mover: its oldest active action, else its oldest waiting item
 * (callers tell them apart via `status`), else null (= stalled).
 */
export function currentActionFor(projectId: string, actions: readonly Action[]): Action | null {
  let best: Action | null = null;
  for (const a of actions) {
    if (a.project_id !== projectId || !isActionable(a)) continue;
    if (
      !best ||
      (a.status === "active" && best.status === "waiting") ||
      (a.status === best.status && a.sort_order < best.sort_order)
    ) {
      best = a;
    }
  }
  return best;
}

/** A project's open items (active + waiting), oldest first — the nested checklist order. */
export function openActionsFor(projectId: string, actions: readonly Action[]): Action[] {
  return actions
    .filter((a) => a.project_id === projectId && isActionable(a))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Progress line numbers: done vs. everything still standing (dropped items don't count). */
export function projectProgress(
  projectId: string,
  actions: readonly Action[],
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const a of actions) {
    if (a.project_id !== projectId || a.status === "dropped") continue;
    total++;
    if (a.status === "done") done++;
  }
  return { done, total };
}

// ───────────────────────────── tickler / resurface ─────────────────────────────
// Dates here are LOCAL calendar days ("YYYY-MM-DD"), never timestamps: an item set to
// resurface on the 12th should appear on YOUR 12th, not at some UTC instant. Because the
// format is zero-padded and fixed-width, plain string comparison IS date comparison.

/** Today as a local "YYYY-MM-DD" key. */
export function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** N days from `from`, as a local day key (used by the "tomorrow" / "next week" shortcuts). */
export function dayKeyPlus(from: Date, days: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return dayKey(d);
}

/** Waiting in the tickler — off every list until its day comes. */
export function isDeferred(a: Action, today: string): boolean {
  return a.resurface_on != null && a.resurface_on > today;
}

/** Its day has come (or passed) — it belongs in the inbox, to be decided fresh. */
export function isResurfaced(a: Action, today: string): boolean {
  return (
    a.resurface_on != null &&
    a.resurface_on <= today &&
    (a.status === "active" || a.status === "someday")
  );
}

/** Every item due to resurface, oldest date first — the inbox's tickler section. */
export function resurfacedActions(actions: readonly Action[], today: string): Action[] {
  return actions
    .filter((a) => isResurfaced(a, today))
    .sort((a, b) => (a.resurface_on ?? "").localeCompare(b.resurface_on ?? ""));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today" / "tomorrow" / "12 Aug" — how a pending tickler date reads on a row. */
export function resurfaceLabel(dateKey: string, today: string): string {
  if (dateKey === today) return "today";
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return dateKey;
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000,
  );
  if (diff === 1) return "tomorrow";
  if (diff > 1 && diff < 7) return `in ${diff} days`;
  return `${d} ${MONTHS[m - 1]}`;
}

/** A review goes amber at a week — GTD's cadence, not a streak. */
export const REVIEW_DUE_DAYS = 7;

/**
 * How the weekly review reads on screen: when it last happened, and whether it's due.
 * Never-reviewed counts as due (that's the nudge to do the first one), and an unparseable
 * or future stamp degrades to "due" rather than to a lie about being fresh.
 */
export function reviewFreshness(
  lastReviewedAt: string | null,
  now: Date,
): { label: string; due: boolean } {
  if (!lastReviewedAt) return { label: "Not reviewed yet", due: true };
  const then = Date.parse(lastReviewedAt);
  if (Number.isNaN(then)) return { label: "Not reviewed yet", due: true };
  const days = Math.floor((now.getTime() - then) / 86_400_000);
  const due = days >= REVIEW_DUE_DAYS || days < 0;
  if (days < 0) return { label: "Last reviewed just now", due };
  if (days === 0) return { label: "Last reviewed today", due };
  if (days === 1) return { label: "Last reviewed yesterday", due };
  return { label: `Last reviewed ${days} days ago`, due };
}

/**
 * True when no review has been completed yet in `now`'s calendar month — the trigger for the
 * review's extra horizons step. Monthly, not "every 4th review": the point is to look up from
 * the runway on a calendar rhythm, and a month you reviewed twice doesn't need it twice.
 */
export function isFirstReviewOfMonth(completions: readonly string[], now: Date): boolean {
  const y = now.getFullYear();
  const m = now.getMonth();
  return !completions.some((iso) => {
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
  });
}

/** "today" / "1 day" / "N days" since the given ISO timestamp — Waiting-For aging. */
export function waitingAgeLabel(sinceIso: string, now: Date): string {
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return "";
  const days = Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
  if (days === 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}
