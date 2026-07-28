"use client";

import { useState } from "react";
import {
  createAction,
  setProjectStatus,
  useActions,
  useContexts,
  useProjects,
} from "@/lib/gtd/store";
import type { Context, Project } from "@/lib/gtd/types";
import { currentActionFor, projectNeedsNextAction } from "@/lib/gtd/views";

/**
 * Projects — outcomes needing >1 action (Horizon 10k). Each card shows the project's current
 * mover; a project with nothing actionable is stalled (GTD's cardinal rule) and gets the
 * choice that rule demands: name the next action, or mark the project complete.
 */
export function ProjectsList() {
  const projects = useProjects();
  const actions = useActions();
  const contexts = useContexts();
  const active = projects.filter((p) => p.status === "active");

  if (active.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
        <p className="text-lg font-medium">No projects yet</p>
        <p className="text-sm text-muted">
          When you clarify an inbox item that takes more than one step, it becomes a project here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {active.map((p) => (
        <ProjectCard key={p.id} project={p} actions={actions} contexts={contexts} />
      ))}
    </ul>
  );
}

function ProjectCard({
  project,
  actions,
  contexts,
}: {
  project: Project;
  actions: ReturnType<typeof useActions>;
  contexts: readonly Context[];
}) {
  const stalled = projectNeedsNextAction(project, actions);
  const mover = currentActionFor(project.id, actions);
  const contextName = mover?.context_id
    ? contexts.find((c) => c.id === mover.context_id)?.name
    : undefined;

  return (
    <li className="rounded-[10px] border border-border bg-surface p-4">
      <p className="text-[15px] font-medium leading-relaxed">{project.title}</p>
      {mover && (
        <p className="mt-1 text-sm text-muted">
          {mover.status === "waiting" ? "Waiting: " : "Next: "}
          {mover.title}
          {mover.status === "waiting" && mover.waiting_on_text && ` (on ${mover.waiting_on_text})`}
          {mover.status === "active" && contextName && (
            <span className="text-tertiary"> · {contextName}</span>
          )}
        </p>
      )}
      {stalled && <StalledControls project={project} contexts={contexts} />}
    </li>
  );
}

/** The surfaced re-decision for a stalled project: add its next action, or complete it. */
function StalledControls({
  project,
  contexts,
}: {
  project: Project;
  contexts: readonly Context[];
}) {
  const [title, setTitle] = useState("");
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contextId = selectedContextId ?? contexts[0]?.id ?? null;

  async function add() {
    if (busy || !title.trim()) return;
    setBusy(true);
    setError(null);
    const action = await createAction({ title, context_id: contextId, project_id: project.id });
    setBusy(false);
    if (!action) {
      setError("Couldn't save on this device — try again.");
      return;
    }
    setTitle("");
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-sm text-warning">Needs a next action — name one, or mark it complete.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Next physical action (verb-first)"
          aria-label={`Next action for ${project.title}`}
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
        />
        <select
          value={contextId ?? ""}
          onChange={(e) => setSelectedContextId(e.target.value)}
          aria-label="Context"
          className="rounded-[10px] border border-border bg-surface px-2 py-2 text-sm text-muted outline-none focus:border-border-strong"
        >
          {contexts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !title.trim() || contexts.length === 0}
          onClick={() => void add()}
          className="btn-accent rounded-lg px-3 py-2 text-sm font-medium"
        >
          Add
        </button>
        <button
          type="button"
          // Never rejects (returns false on write failure); on failure the card simply stays.
          onClick={() => void setProjectStatus(project.id, "completed")}
          className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          Mark complete
        </button>
      </div>
    </div>
  );
}
