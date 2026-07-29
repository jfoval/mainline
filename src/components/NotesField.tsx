"use client";

/**
 * One clean notes field, shared by actions, someday items and projects. Collapsed it's a quiet
 * link (or the note itself); expanded it's a plain textarea. Notes are the thinking that hangs
 * off an item — deliberately not searchable structure, not a second inbox.
 */
import { useState } from "react";

export function NotesField({
  notes,
  label,
  onSave,
}: {
  notes: string | null;
  /** Accessible label — e.g. `Notes for ${title}`. */
  label: string;
  onSave: (next: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [error, setError] = useState(false);

  async function save() {
    setError(false);
    const ok = await onSave(draft);
    if (!ok) {
      setError(true);
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-2 flex flex-col gap-2">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          rows={4}
          aria-label={label}
          placeholder="Anything worth remembering about this…"
          className="w-full resize-y rounded-[10px] border border-border bg-surface-2 p-2 text-sm leading-relaxed outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-danger">Couldn&apos;t save on this device. Try again.</p>}
        <div className="flex justify-end gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setDraft(notes ?? "");
              setEditing(false);
              setError(false);
            }}
            className="rounded-lg px-3 py-1.5 text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button type="button" onClick={() => void save()} className="btn-accent rounded-lg px-3 py-1.5 font-medium">
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(notes ?? ""); // re-seed: another device may have edited the note since
        setEditing(true);
      }}
      className="mt-1 block w-full text-left"
    >
      {notes ? (
        <span className="block whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
          {notes}
        </span>
      ) : (
        <span className="text-xs text-tertiary transition-colors hover:text-muted">+ Add a note</span>
      )}
    </button>
  );
}
