"use client";

/**
 * Items whose tickler day has arrived. They sit at the top of the inbox — not on the runway —
 * because a deferred thing deserves a fresh decision, not a silent reappearance among your
 * next actions. Deciding here clears the date (setResurfaceDate writes both in one row).
 */
import { restoreAction, setResurfaceDate, useActions } from "@/lib/gtd/store";
import { dayKey, resurfaceLabel, resurfacedActions } from "@/lib/gtd/views";
import { showUndo } from "@/lib/undo";
import { ResurfacePicker } from "./ResurfacePicker";

export function ResurfacedList() {
  const actions = useActions();
  const today = dayKey(new Date());
  const due = resurfacedActions(actions, today);

  if (due.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Back today</h2>
      <ul className="divide-y divide-border rounded-[10px] border border-border bg-surface px-3">
        {due.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-relaxed">{a.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                you asked for this back {resurfaceLabel(a.resurface_on ?? today, today)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const prev = { ...a };
                  void setResurfaceDate(a.id, null, "active");
                  showUndo({ label: "Moved to Next Actions", onUndo: () => void restoreAction(prev) });
                }}
                className="btn-accent rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                Do it
              </button>
              <ResurfacePicker action={a} label="Later…" />
              <button
                type="button"
                onClick={() => {
                  const prev = { ...a };
                  void setResurfaceDate(a.id, null, "someday");
                  showUndo({ label: "Moved to Someday", onUndo: () => void restoreAction(prev) });
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                Someday
              </button>
              <button
                type="button"
                onClick={() => {
                  const prev = { ...a };
                  void setResurfaceDate(a.id, null, "dropped");
                  showUndo({ label: "Dropped", onUndo: () => void restoreAction(prev) });
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-danger"
              >
                Drop
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
