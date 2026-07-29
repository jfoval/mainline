"use client";

/**
 * Reference — the answer to "where did I put that?". Each row is a note to yourself about
 * where something is kept ("Dyson warranty: in Gmail, search Dyson"), optionally with a link and
 * optionally tied to a project. The thing itself stays wherever it already is; Mainline only
 * remembers where that was.
 *
 * Search is a plain client-side filter over the line, the link and the project name — the whole
 * index lives in memory anyway, and anything cleverer would be a search engine for a list you
 * can read.
 */
import { useState } from "react";
import {
  archiveReference,
  createReference,
  restoreReference,
  updateReference,
  useProjects,
  useReferences,
} from "@/lib/gtd/store";
import type { Project, ReferenceItem } from "@/lib/gtd/types";
import { showUndo } from "@/lib/undo";

export function ReferenceIndex() {
  const references = useReferences();
  const projects = useProjects();
  const [query, setQuery] = useState("");

  const projectName = (id: string | null) =>
    id ? projects.find((p) => p.id === id)?.title : undefined;

  const q = query.trim().toLowerCase();
  const shown = q
    ? references.filter((r) =>
        [r.title, r.url ?? "", projectName(r.project_id) ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : references;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <NewReferenceForm projects={projects} />

      {references.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search these notes"
          aria-label="Search your reference notes"
          type="search"
          className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
        />
      )}

      {references.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-lg font-medium">Nothing here yet</p>
          <p className="max-w-sm text-sm text-muted">
            Write down where you keep something, so you can find it later. For example:
            “Dyson warranty: in Gmail, search Dyson”, or “Lease: blue folder in the hall cupboard”.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nothing matches “{query}”.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <ReferenceRow
              key={r.id}
              reference={r}
              projects={projects}
              projectTitle={projectName(r.project_id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewReferenceForm({ projects }: { projects: readonly Project[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = projects.filter((p) => p.status === "active");

  async function create() {
    if (busy || !title.trim()) return;
    setBusy(true);
    setError(false);
    const ok = await createReference({ title, url, project_id: projectId || null });
    setBusy(false);
    if (!ok) {
      setError(true);
      return;
    }
    setTitle("");
    setUrl("");
    setProjectId("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        + Note where something is
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface-2 p-3">
      <label className="text-sm text-muted" htmlFor="ref-title">
        What is it, and where do you keep it?
      </label>
      <input
        id="ref-title"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void create();
        }}
        placeholder="e.g. Dyson warranty: in Gmail, search Dyson"
        className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
      />
      <label className="text-sm text-muted" htmlFor="ref-url">
        Link (optional)
      </label>
      <input
        id="ref-url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        inputMode="url"
        placeholder="https://…"
        className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
      />
      {active.length > 0 && (
        <>
          <label className="text-sm text-muted" htmlFor="ref-project">
            Part of a project? (optional)
          </label>
          <select
            id="ref-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] text-muted outline-none focus:border-accent"
          >
            <option value="">No project</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </>
      )}
      {error && <p className="text-sm text-danger">Couldn&apos;t save on this device. Try again.</p>}
      <div className="flex items-center justify-end gap-2 text-sm">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-2 text-muted hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void create()}
          className="btn-accent rounded-lg px-4 py-2 font-medium"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ReferenceRow({
  reference,
  projects,
  projectTitle,
}: {
  reference: ReferenceItem;
  projects: readonly Project[];
  projectTitle?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(reference.title);
  const [url, setUrl] = useState(reference.url ?? "");
  const [projectId, setProjectId] = useState(reference.project_id ?? "");
  const active = projects.filter((p) => p.status === "active");

  async function save() {
    const ok = await updateReference(reference.id, {
      title,
      url,
      project_id: projectId || null,
    });
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface-2 p-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="What it is and where you keep it"
          className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="https://…"
          aria-label="Link"
          className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
        />
        {active.length > 0 && (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Project"
            className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] text-muted outline-none focus:border-accent"
          >
            <option value="">No project</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!title.trim()}
            onClick={() => void save()}
            className="btn-accent rounded-lg px-3 py-1.5 font-medium"
          >
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-[10px] border border-border bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-relaxed">{reference.title}</p>
        {(reference.url || projectTitle) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {reference.url && (
              <a
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-link underline-offset-4 hover:underline"
              >
                open link
              </a>
            )}
            {reference.url && projectTitle && <span aria-hidden>·</span>}
            {projectTitle}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => {
            setTitle(reference.title);
            setUrl(reference.url ?? "");
            setProjectId(reference.project_id ?? "");
            setEditing(true);
          }}
          className="rounded-md px-2 py-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            const prev = { ...reference };
            void archiveReference(reference.id);
            showUndo({ label: "Removed", onUndo: () => void restoreReference(prev) });
          }}
          className="rounded-md px-2 py-1 text-muted transition-colors hover:text-danger"
        >
          Remove
        </button>
      </div>
    </li>
  );
}
