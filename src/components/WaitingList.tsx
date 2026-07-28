"use client";

import { setActionStatus, useActions } from "@/lib/gtd/store";
import { waitingAgeLabel } from "@/lib/gtd/views";

/**
 * Waiting For — delegated or blocked items, oldest first so aging ones surface (the GTD
 * review query). Resolving one either finishes it (done) or hands the move back to you
 * (→ next actions).
 */
export function WaitingList() {
  const actions = useActions();
  const now = new Date();
  const waiting = actions
    .filter((a) => a.status === "waiting")
    .sort((a, b) => (a.waiting_since ?? "").localeCompare(b.waiting_since ?? ""));

  if (waiting.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
        <p className="text-lg font-medium">Waiting on nothing</p>
        <p className="text-sm text-muted">
          When you clarify an inbox item as someone else&apos;s move, it lands here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {waiting.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-3">
          <button
            type="button"
            aria-label="Mark done"
            // Never rejects (returns false on write failure); on failure the row simply stays.
            onClick={() => void setActionStatus(a.id, "done")}
            className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-border-strong transition-colors hover:border-accent hover:bg-accent/10"
          />
          <div className="flex flex-1 flex-col">
            <span className="text-[15px] leading-relaxed">{a.title}</span>
            <span className="mt-0.5 text-xs text-muted">
              {a.waiting_on_text ? `on ${a.waiting_on_text} · ` : ""}
              waiting {a.waiting_since ? waitingAgeLabel(a.waiting_since, now) : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void setActionStatus(a.id, "active")}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            My move now
          </button>
        </li>
      ))}
    </ul>
  );
}
