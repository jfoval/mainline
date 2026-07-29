"use client";

import { useState } from "react";
import {
  archiveContext,
  createContext,
  renameContext,
  restoreContext,
  useActions,
  useContexts,
} from "@/lib/gtd/store";
import type { Context } from "@/lib/gtd/types";
import { showUndo } from "@/lib/undo";

/**
 * Your contexts, your way — add, rename, archive. Archiving folds the context's actions into
 * "No context" on the Next list (visible, never lost) and syncs across devices; the Undo toast
 * brings it straight back.
 */
export function ContextsManager() {
  const contexts = useContexts();
  const actions = useActions();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    const created = await createContext(name);
    setBusy(false);
    if (!created) {
      setError("Couldn't save on this device. Try again.");
      return;
    }
    setName("");
  }

  const openCountFor = (id: string) =>
    actions.filter((a) => a.context_id === id && (a.status === "active" || a.status === "waiting"))
      .length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="e.g. @work, @errands, @ Sarah"
          aria-label="New context name"
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none placeholder:text-muted focus:border-border-strong"
        />
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void add()}
          className="btn-accent rounded-lg px-4 py-2 font-medium"
        >
          Add
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="divide-y divide-border">
        {contexts.map((c) => (
          <ContextRow
            key={c.id}
            context={c}
            openCount={openCountFor(c.id)}
            isLast={contexts.length === 1}
          />
        ))}
      </ul>
    </div>
  );
}

function ContextRow({
  context,
  openCount,
  isLast,
}: {
  context: Context;
  openCount: number;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(context.name);

  async function save() {
    const ok = await renameContext(context.id, draft);
    if (ok) setEditing(false);
  }

  function archive() {
    const prev = { ...context };
    // Never rejects (returns false on write failure); on failure the row simply stays.
    void archiveContext(context.id);
    showUndo({ label: `${prev.name} archived`, onUndo: () => void restoreContext(prev) });
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-2.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label={`Rename ${context.name}`}
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3 py-1.5 text-[15px] outline-none focus:border-border-strong"
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
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex-1 text-[15px]">{context.name}</span>
      {openCount > 0 && (
        <span className="text-xs text-tertiary">
          {openCount} open {openCount === 1 ? "action" : "actions"}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setDraft(context.name);
          setEditing(true);
        }}
        className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        Rename
      </button>
      <button
        type="button"
        disabled={isLast}
        title={isLast ? "Keep at least one context" : undefined}
        onClick={archive}
        className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        Archive
      </button>
    </li>
  );
}
