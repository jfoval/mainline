"use client";

/**
 * Set (or move) an item's tickler date — GTD's 43 folders, minus the folders. While a date is
 * set the item is off every list; on that morning it reappears in the inbox to be decided
 * fresh. Shared by Next Actions, Someday and the resurfaced-items list.
 */
import { useState } from "react";
import { setResurfaceDate } from "@/lib/gtd/store";
import type { Action, ActionStatus } from "@/lib/gtd/types";
import { dayKey, dayKeyPlus } from "@/lib/gtd/views";

export function ResurfacePicker({
  action,
  label,
  /** Status to apply along with the date — e.g. parking a resurfaced item back on Someday. */
  status,
}: {
  action: Action;
  label: string;
  status?: ActionStatus;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState(false);
  const now = new Date();
  const today = dayKey(now);

  async function choose(date: string) {
    setError(false);
    const ok = await setResurfaceDate(action.id, date, status);
    if (!ok) {
      setError(true);
      return;
    }
    setOpen(false);
    setCustom("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="w-full rounded-[10px] border border-border bg-surface-2 p-3">
      <p className="text-sm text-muted">Bring it back…</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <Quick onClick={() => void choose(dayKeyPlus(now, 1))}>Tomorrow</Quick>
        <Quick onClick={() => void choose(dayKeyPlus(now, 7))}>In a week</Quick>
        <Quick onClick={() => void choose(dayKeyPlus(now, 30))}>In a month</Quick>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={custom}
          min={today}
          onChange={(e) => setCustom(e.target.value)}
          aria-label={`Resurface date for ${action.title}`}
          className="rounded-[10px] border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-border-strong"
        />
        <button
          type="button"
          disabled={!custom}
          onClick={() => void choose(custom)}
          className="btn-accent rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          Set
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(false);
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">Couldn&apos;t save on this device. Try again.</p>}
    </div>
  );
}

function Quick({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border px-3 py-1.5 text-muted transition-colors hover:border-border-strong hover:text-foreground"
    >
      {children}
    </button>
  );
}
