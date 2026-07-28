"use client";

import { setActionStatus, useActions, useContexts } from "@/lib/gtd/store";
import type { Action, Context } from "@/lib/gtd/types";

/**
 * Next Actions — what you can actually do, grouped by context (GTD's "engage" filter). Check one
 * off to mark it done. Someday/waiting/done items live elsewhere; this is the runway.
 */
export function NextActionsList() {
  const actions = useActions();
  const contexts = useContexts();
  const active = actions.filter((a) => a.status === "active");

  if (active.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
        <p className="text-lg font-medium">No next actions yet</p>
        <p className="text-sm text-muted">
          Clarify an inbox item into a next action and it shows up here.
        </p>
      </div>
    );
  }

  const byContext = groupByContext(active, contexts);

  return (
    <div className="flex flex-col gap-6">
      {byContext.map(({ context, items }) => (
        <section key={context?.id ?? "none"} className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            {context?.name ?? "No context"}
          </h2>
          <ul className="divide-y divide-border">
            {items.map((a) => (
              <ActionRow key={a.id} action={a} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ActionRow({ action }: { action: Action }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <button
        type="button"
        aria-label="Mark done"
        // setActionStatus never rejects (returns false on write failure, leaving the row as-is),
        // so fire-and-forget is safe: on failure the item simply stays visible.
        onClick={() => void setActionStatus(action.id, "done")}
        className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-border-strong transition-colors hover:border-accent hover:bg-accent/10"
      />
      <div className="flex flex-1 flex-col">
        <span className="text-[15px] leading-relaxed">{action.title}</span>
        {action.is_two_minute && (
          <span className="mt-0.5 text-xs text-accent-link">2-minute · do it now</span>
        )}
      </div>
    </li>
  );
}

/** Group active actions by context, contexts in their sort order, "No context" last. Actions
 *  whose context_id matches no loaded context fold into "No context" — never silently dropped. */
function groupByContext(
  actions: readonly Action[],
  contexts: readonly Context[],
): Array<{ context: Context | null; items: Action[] }> {
  const groups = new Map<string | null, Action[]>();
  for (const a of actions) {
    const key = a.context_id;
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  const ordered: Array<{ context: Context | null; items: Action[] }> = [];
  const known = new Set<string | null>();
  for (const c of contexts) {
    known.add(c.id);
    const items = groups.get(c.id);
    if (items && items.length) ordered.push({ context: c, items });
  }
  const leftovers = [...groups.entries()]
    .filter(([key]) => key === null || !known.has(key))
    .flatMap(([, items]) => items);
  if (leftovers.length) ordered.push({ context: null, items: leftovers });
  return ordered;
}
