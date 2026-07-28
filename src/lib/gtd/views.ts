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

/** "today" / "1 day" / "N days" since the given ISO timestamp — Waiting-For aging. */
export function waitingAgeLabel(sinceIso: string, now: Date): string {
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return "";
  const days = Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
  if (days === 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}
