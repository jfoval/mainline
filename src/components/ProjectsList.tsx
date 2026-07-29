"use client";

import { useState } from "react";
import {
  createAction,
  createProject,
  restoreAction,
  restoreProject,
  setActionStatus,
  setProjectNotes,
  setProjectStatus,
  updateProjectTitle,
  useActions,
  useContexts,
  useProjects,
} from "@/lib/gtd/store";
import type { Action, Context, Project } from "@/lib/gtd/types";
import {
  dayKey,
  openActionsFor,
  projectNeedsNextAction,
  projectProgress,
  resurfaceLabel,
} from "@/lib/gtd/views";
import { showUndo } from "@/lib/undo";
import { ContextChips } from "./ContextChips";
import { NotesField } from "./NotesField";

/**
 * Projects — outcomes needing >1 action (Horizon 10k). The title IS the outcome statement
 * ("what done looks like"); its open actions nest underneath as a checklist. A project with
 * nothing actionable is stalled (GTD's cardinal rule) and gets the choice that rule demands:
 * name the next action, or mark the project complete.
 */
export function ProjectsList() {
  const projects = useProjects();
  const actions = useActions();
  const contexts = useContexts();
  const active = projects.filter((p) => p.status === "active");

  return (
    <div className="flex flex-1 flex-col gap-3">
      <NewProjectForm contexts={contexts} />
      {active.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-lg font-medium">No projects yet</p>
          <p className="text-sm text-muted">
            Start one above, or clarify an inbox item that takes more than one step.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((p) => (
            <ProjectCard key={p.id} project={p} actions={actions} contexts={contexts} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** "+ New project" — for when you already know it's a project before any capture exists. */
function NewProjectForm({ contexts }: { contexts: readonly Context[] }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [firstAction, setFirstAction] = useState("");
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contextId = selectedContextId ?? contexts[0]?.id ?? null;

  async function create() {
    if (busy || !outcome.trim() || !firstAction.trim()) return;
    setBusy(true);
    setError(null);
    const project = await createProject({ title: outcome });
    const action = project
      ? await createAction({ title: firstAction, context_id: contextId, project_id: project.id })
      : null;
    setBusy(false);
    if (!project || !action) {
      setError("Couldn't save on this device. Try again.");
      return;
    }
    setOutcome("");
    setFirstAction("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        + New project
      </button>
    );
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface-2 p-3">
      <div className="flex flex-col gap-3">
        <label className="text-sm text-muted" htmlFor="np-outcome">
          What&apos;s the outcome? (state it as already done)
        </label>
        <input
          id="np-outcome"
          autoFocus
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="e.g. Maui trip booked"
          className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
        />
        <label className="text-sm text-muted" htmlFor="np-first">
          And the very next physical action?
        </label>
        <input
          id="np-first"
          value={firstAction}
          onChange={(e) => setFirstAction(e.target.value)}
          placeholder="e.g. Email venue re: availability"
          className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
        />
        <ContextChips contexts={contexts} contextId={contextId} onSelect={setSelectedContextId} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2 text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !outcome.trim() || !firstAction.trim() || contexts.length === 0}
            onClick={() => void create()}
            className="btn-accent rounded-lg px-4 py-2 font-medium"
          >
            {contexts.length === 0 ? "Loading contexts…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  actions,
  contexts,
}: {
  project: Project;
  actions: readonly Action[];
  contexts: readonly Context[];
}) {
  const stalled = projectNeedsNextAction(project, actions);
  const open = openActionsFor(project.id, actions);
  const { done, total } = projectProgress(project.id, actions);

  return (
    <li className="rounded-[10px] border border-border bg-surface p-4">
      <TitleRow project={project} />
      {total > 0 && (
        <p className="mt-0.5 text-xs text-tertiary">
          {done} of {total} done
        </p>
      )}
      <NotesField
        notes={project.notes}
        label={`Notes for ${project.title}`}
        onSave={(next) => setProjectNotes(project.id, next)}
      />

      {open.length > 0 && (
        <ul className="mt-2 divide-y divide-border/60">
          {open.map((a) => (
            <NestedActionRow key={a.id} action={a} contexts={contexts} />
          ))}
        </ul>
      )}

      {stalled && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
          <p className="text-sm text-warning">
            Needs a next action. Name one below, or mark it complete.
          </p>
          <button
            type="button"
            onClick={() => {
              const prev = { ...project };
              // Never rejects (returns false on write failure); on failure the card stays.
              void setProjectStatus(project.id, "completed");
              showUndo({ label: "Project completed", onUndo: () => void restoreProject(prev) });
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            Mark complete
          </button>
        </div>
      )}

      <AddActionRow project={project} contexts={contexts} withDivider={!stalled} />
    </li>
  );
}

/** Project title (the outcome statement) with inline rename. */
function TitleRow({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.title);

  async function save() {
    const ok = await updateProjectTitle(project.id, draft);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Project outcome"
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3 py-1.5 text-[15px] font-medium outline-none focus:border-accent"
        />
        <button type="button" onClick={() => void save()} className="btn-accent rounded-lg px-3 py-1.5 text-sm font-medium">
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-[15px] font-medium leading-relaxed">{project.title}</p>
      <button
        type="button"
        onClick={() => {
          setDraft(project.title);
          setEditing(true);
        }}
        className="shrink-0 rounded-md px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        Edit
      </button>
    </div>
  );
}

/** One open item in the project's nested checklist. */
function NestedActionRow({ action, contexts }: { action: Action; contexts: readonly Context[] }) {
  const contextName = action.context_id
    ? contexts.find((c) => c.id === action.context_id)?.name
    : undefined;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        aria-label="Mark done"
        onClick={() => {
          const prev = { ...action };
          void setActionStatus(action.id, "done");
          showUndo({ label: "Marked done", onUndo: () => void restoreAction(prev) });
        }}
        className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-border-strong transition-colors hover:border-accent hover:bg-accent/10"
      />
      <div className="flex flex-1 flex-col">
        <span className="text-[15px] leading-relaxed">{action.title}</span>
        <span className="mt-0.5 text-xs text-muted">
          {action.status === "waiting"
            ? `waiting${action.waiting_on_text ? ` on ${action.waiting_on_text}` : ""}`
            : contextName}
          {/* A deferred mover is off the runway — say so here, or the project looks busy
              while nothing is showing up in Next Actions. */}
          {action.resurface_on && (
            <span className="text-tertiary">
              {action.status === "waiting" || contextName ? " · " : ""}
              back {resurfaceLabel(action.resurface_on, dayKey(new Date()))}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

/** Always-available "add an action to this project" row. */
function AddActionRow({
  project,
  contexts,
  withDivider,
}: {
  project: Project;
  contexts: readonly Context[];
  withDivider: boolean;
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
      setError("Couldn't save on this device. Try again.");
      return;
    }
    setTitle("");
  }

  return (
    <div className={`mt-3 flex flex-col gap-2 ${withDivider ? "border-t border-border pt-3" : ""}`}>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Add a next action (verb-first)"
          aria-label={`Next action for ${project.title}`}
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={contextId ?? ""}
          onChange={(e) => setSelectedContextId(e.target.value)}
          aria-label="Context"
          className="rounded-[10px] border border-border bg-surface px-2 py-2 text-sm text-muted outline-none focus:border-accent"
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
      </div>
    </div>
  );
}
