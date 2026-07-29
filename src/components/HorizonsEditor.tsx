"use client";

/**
 * Horizons of Focus — four plain prose sections above the runway (FOUNDATIONS §2). No structure,
 * no scoring, no linking projects to goals: this is the page you re-read to check that the busy
 * list below still points somewhere you meant. Each section is its own synced row, so editing
 * Purpose here and Goals on your phone doesn't cost you either one.
 */
import { useState } from "react";
import { setHorizon, useHorizons } from "@/lib/gtd/store";
import { HORIZONS, type HorizonKey } from "@/lib/gtd/types";

export function HorizonsEditor({ compact = false }: { compact?: boolean }) {
  const bodies = useHorizons();

  return (
    <div className="flex flex-col gap-3">
      {HORIZONS.map((h) => (
        <HorizonSection
          key={h.key}
          horizonKey={h.key}
          title={h.title}
          hint={h.hint}
          body={bodies[h.key]}
          compact={compact}
        />
      ))}
    </div>
  );
}

function HorizonSection({
  horizonKey,
  title,
  hint,
  body,
  compact,
}: {
  horizonKey: HorizonKey;
  title: string;
  hint: string;
  body: string;
  compact: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [error, setError] = useState(false);

  async function save() {
    setError(false);
    const ok = await setHorizon(horizonKey, draft);
    if (!ok) {
      setError(true);
      return;
    }
    setEditing(false);
  }

  return (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(body); // re-seed: another device may have edited since this render
              setEditing(true);
            }}
            className="shrink-0 rounded-md px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {body ? "Edit" : "Write"}
          </button>
        )}
      </div>
      {!compact && <p className="mt-0.5 text-xs text-tertiary">{hint}</p>}

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            rows={5}
            aria-label={title}
            className="w-full resize-y rounded-[10px] border border-border bg-surface-2 p-2 text-sm leading-relaxed outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-danger">Couldn&apos;t save on this device. Try again.</p>}
          <div className="flex justify-end gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setDraft(body);
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
      ) : body ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
          {body}
        </p>
      ) : (
        <p className="mt-2 text-sm text-tertiary">Empty for now.</p>
      )}
    </section>
  );
}
