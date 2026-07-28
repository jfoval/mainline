"use client";

import { setActionStatus, useActions } from "@/lib/gtd/store";

/**
 * Someday / Maybe — things you might do, kept visible so the system stays trustworthy (GTD:
 * an item you filed must never vanish). Reactivating moves it onto the Next Actions runway;
 * the weekly review (later slice) will drive regular re-decisions here.
 */
export function SomedayList() {
  const actions = useActions();
  const someday = actions.filter((a) => a.status === "someday");

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
    <ul className="divide-y divide-border">
      {someday.map((a) => (
        <li key={a.id} className="flex items-center gap-3 py-3">
          <span className="flex-1 text-[15px] leading-relaxed">{a.title}</span>
          <button
            type="button"
            // Never rejects (returns false on write failure); on failure the row simply stays.
            onClick={() => void setActionStatus(a.id, "active")}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            Make it a next action
          </button>
        </li>
      ))}
    </ul>
  );
}
