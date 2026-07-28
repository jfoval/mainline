"use client";

import { undoCurrent, useUndo } from "@/lib/undo";

/**
 * The single global undo pill. Sits above the mobile tab bar (bottom-20) and near the bottom on
 * desktop. Rendered from the root layout; shows nothing when there's no undoable action.
 */
export function UndoToast() {
  const entry = useUndo();
  if (!entry) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 z-20 flex justify-center px-4 sm:bottom-6"
    >
      <div className="flex items-center gap-3 rounded-full border border-border-strong bg-surface-2 py-2 pl-4 pr-2 shadow-lg">
        <span className="text-sm">{entry.label}</span>
        <button
          type="button"
          onClick={undoCurrent}
          className="rounded-full px-3 py-1 text-sm font-medium text-accent-link transition-colors hover:bg-accent/10"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
