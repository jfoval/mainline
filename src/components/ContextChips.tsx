"use client";

import type { Context } from "@/lib/gtd/types";

/** Pill selector for GTD contexts — shared by Clarify and the project forms. */
export function ContextChips({
  contexts,
  contextId,
  onSelect,
}: {
  contexts: readonly Context[];
  contextId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {contexts.map((c) => {
        const active = c.id === contextId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={
              active
                ? "rounded-full border border-accent px-3 py-1 text-sm text-accent-link"
                : "rounded-full border border-border px-3 py-1 text-sm text-muted transition-colors hover:text-foreground"
            }
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
