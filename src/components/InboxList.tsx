"use client";

import { useState } from "react";
import { discardCapture, editCapture, useCaptures } from "@/lib/capture/store";
import type { Capture } from "@/lib/capture/types";

/** Inbox — every captured item, newest first, with edit + delete. Exercises the full
 *  op-log edit/delete + tombstone path end-to-end. */
export function InboxList() {
  const captures = useCaptures();
  const items = captures.filter((c) => c.status !== "discarded");

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
        <p className="text-lg font-medium">Inbox zero</p>
        <p className="text-sm text-muted">
          Nothing captured yet. Head to Capture and get it out of your head.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((capture) => (
        <CaptureRow key={capture.client_id} capture={capture} />
      ))}
    </ul>
  );
}

function CaptureRow({ capture }: { capture: Capture }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(capture.raw_text);

  const startEditing = () => {
    setDraft(capture.raw_text); // seed the draft from the latest synced text
    setEditing(true);
  };

  const save = async () => {
    await editCapture(capture.client_id, draft);
    setEditing(false);
  };

  const remove = async () => {
    if (window.confirm("Delete this capture?")) {
      await discardCapture(capture.client_id);
    }
  };

  return (
    <li className="-mx-1 rounded-md px-2 py-3.5 transition-colors hover:bg-white/[0.03]">
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void save();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-surface-2 p-2 outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2 text-sm">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="btn-accent rounded-lg px-3 py-1.5 font-medium"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {capture.raw_text}
          </p>
          <div className="flex items-center justify-between text-xs text-muted">
            <div className="flex items-center gap-2">
              <SyncBadge pending={capture.pending} />
              <span aria-hidden>·</span>
              <time dateTime={capture.captured_at} title={new Date(capture.captured_at).toLocaleString()}>
                {relativeTime(capture.captured_at)}
              </time>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startEditing}
                className="rounded-md px-2 py-1 hover:bg-surface-2 hover:text-foreground"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                className="rounded-md px-2 py-1 hover:bg-danger/10 hover:text-danger"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function SyncBadge({ pending }: { pending: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${pending ? "bg-warning" : "bg-success"}`}
        aria-hidden
      />
      {pending ? "Saving…" : "Synced"}
    </span>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  // Future timestamp (bad device clock) — show a date rather than a perpetual "just now".
  if (diffMs < -60_000) return new Date(iso).toLocaleDateString();
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
