"use client";

import { useState } from "react";
import {
  promoteToProject,
  restoreAction,
  setActionNotes,
  setActionStatus,
  setProjectStatus,
  useActions,
  useContexts,
} from "@/lib/gtd/store";
import type { Action, Context } from "@/lib/gtd/types";
import { showUndo } from "@/lib/undo";
import { ContextChips } from "./ContextChips";
import { NotesField } from "./NotesField";
import { ResurfacePicker } from "./ResurfacePicker";

/**
 * Someday / Maybe — things you might do, kept visible so the system stays trustworthy (GTD:
 * an item you filed must never vanish). Each item can carry notes, and when its thinking
 * outgrows a one-liner it becomes a project (notes travel with it). Reactivating moves it onto
 * the runway; dropping is the honest other half of the weekly review's someday scan (undoable,
 * and the row is only ever marked dropped — nothing is deleted).
 */
export function SomedayList() {
  const actions = useActions();
  const contexts = useContexts();
  // Items with a tickler date are waiting for their day (or already back in the inbox) — they
  // aren't part of the someday scan until then. See Action.resurface_on.
  const someday = actions.filter((a) => a.status === "someday" && a.resurface_on == null);

  if (someday.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
        <p className="text-lg font-medium">Nothing here yet</p>
        <p className="text-sm text-muted">
          When you clarify an inbox item as “Someday / Maybe”, it lands here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {someday.map((a) => (
        <SomedayRow key={a.id} action={a} contexts={contexts} />
      ))}
    </ul>
  );
}

function SomedayRow({ action, contexts }: { action: Action; contexts: readonly Context[] }) {
  const [promoting, setPromoting] = useState(false);

  return (
    <li className="rounded-[10px] border border-border bg-surface p-4">
      <p className="text-[15px] leading-relaxed">{action.title}</p>
      <NotesField
        notes={action.notes}
        label={`Notes for ${action.title}`}
        onSave={(next) => setActionNotes(action.id, next)}
      />

      {promoting ? (
        <PromotePanel action={action} contexts={contexts} onClose={() => setPromoting(false)} />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            // Never rejects (returns false on write failure); on failure the row simply stays.
            onClick={() => {
              const prev = { ...action };
              void setActionStatus(action.id, "active");
              showUndo({ label: "Moved to Next Actions", onUndo: () => void restoreAction(prev) });
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            Make it a next action
          </button>
          <button
            type="button"
            onClick={() => setPromoting(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            Make it a project
          </button>
          <ResurfacePicker action={action} label="Remind me…" />
          <button
            type="button"
            onClick={() => {
              const prev = { ...action };
              void setActionStatus(action.id, "dropped");
              showUndo({ label: "Dropped", onUndo: () => void restoreAction(prev) });
            }}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-danger"
          >
            Drop
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Growing up: the item's title becomes the outcome and its notes come along. The first next
 * action is asked for here rather than later — a project born without one is stalled from
 * birth, and the weekly review would only have to come back and demand it.
 */
function PromotePanel({
  action,
  contexts,
  onClose,
}: {
  action: Action;
  contexts: readonly Context[];
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState(action.title);
  const [firstAction, setFirstAction] = useState("");
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const contextId = selectedContextId ?? contexts[0]?.id ?? null;

  async function promote() {
    if (busy || !outcome.trim() || !firstAction.trim()) return;
    setBusy(true);
    setError(false);
    const prev = { ...action };
    const created = await promoteToProject({
      actionId: action.id,
      outcome,
      firstAction,
      contextId,
    });
    setBusy(false);
    if (!created) {
      setError(true);
      return;
    }
    showUndo({
      label: "Now a project",
      // Undo the whole promotion, not just half of it: the item comes back to Someday and the
      // project it grew into (plus its first action) is dropped.
      onUndo: () => {
        void restoreAction(prev);
        void setProjectStatus(created.project.id, "dropped");
        void setActionStatus(created.firstAction.id, "dropped");
      },
    });
    onClose();
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[10px] border border-border bg-surface-2 p-3">
      <label className="text-sm text-muted" htmlFor={`promote-outcome-${action.id}`}>
        What&apos;s the outcome? (state it as already done)
      </label>
      <input
        id={`promote-outcome-${action.id}`}
        autoFocus
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-border-strong"
      />
      <label className="text-sm text-muted" htmlFor={`promote-first-${action.id}`}>
        And the very next physical action?
      </label>
      <input
        id={`promote-first-${action.id}`}
        value={firstAction}
        onChange={(e) => setFirstAction(e.target.value)}
        placeholder="e.g. Book the intro lesson"
        className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-border-strong"
      />
      <ContextChips contexts={contexts} contextId={contextId} onSelect={setSelectedContextId} />
      {action.notes && <p className="text-xs text-tertiary">Your notes come with it.</p>}
      {error && <p className="text-sm text-danger">Couldn&apos;t save on this device. Try again.</p>}
      <div className="flex items-center justify-end gap-2 text-sm">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !outcome.trim() || !firstAction.trim() || contexts.length === 0}
          onClick={() => void promote()}
          className="btn-accent rounded-lg px-4 py-2 font-medium"
        >
          Create project
        </button>
      </div>
    </div>
  );
}
