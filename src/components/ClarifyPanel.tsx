"use client";

import { useState } from "react";
import { cancelDiscard, commitDiscard, deferDiscard } from "@/lib/capture/pending-discard";
import { setCaptureStatus } from "@/lib/capture/store";
import { createAction, createProject, createReference, useContexts } from "@/lib/gtd/store";
import { showUndo } from "@/lib/undo";
import { ContextChips } from "./ContextChips";

/**
 * The heart of GTD: clarify ONE inbox item. Actionable? → a next action (with a context),
 * a project (>1 action — created with its first next action, so no project is ever born
 * stalled), or a Waiting-For (someone else's move). Not actionable? → Someday / Reference /
 * Trash. Either way the capture leaves the inbox (status → processed/discarded, which syncs
 * via the capture op-log).
 */
export function ClarifyPanel({
  clientId,
  rawText,
  onDone,
}: {
  clientId: string;
  rawText: string;
  onDone: () => void;
}) {
  const contexts = useContexts();
  const [step, setStep] = useState<"ask" | "no" | "yes" | "project" | "waiting">("ask");
  const [title, setTitle] = useState(rawText);
  const [projectTitle, setProjectTitle] = useState(rawText);
  const [firstAction, setFirstAction] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [twoMin, setTwoMin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effective selection defaults to the first context until the user picks one.
  const contextId = selectedContextId ?? contexts[0]?.id ?? null;

  /**
   * Run one clarify outcome. `fn` returns true only when the organize-side write durably
   * succeeded — ONLY then is the capture marked processed (so it can never silently vanish
   * from the inbox with nothing to show for it) and the panel closed. Failures keep the item
   * in the inbox and show a retryable error.
   */
  async function run(fn: () => Promise<boolean>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await fn();
      if (!ok) {
        setError("Couldn't save on this device. Try again.");
        return;
      }
      onDone();
    } catch {
      setError("Couldn't save on this device. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const trash = () =>
    run(async () => {
      // Deferred: the capture tombstone is terminal once shipped, so the real discard only
      // commits after the undo window. Meanwhile pending-discard hides it from the inbox.
      deferDiscard(clientId);
      showUndo({
        label: "Capture trashed",
        onUndo: () => cancelDiscard(clientId),
        onExpire: () => commitDiscard(clientId),
      });
      return true;
    });
  const someday = () =>
    run(async () => {
      const action = await createAction({
        title: rawText,
        status: "someday",
        source_capture_id: clientId,
      });
      if (!action) return false;
      await setCaptureStatus(clientId, "processed");
      return true;
    });
  const reference = () =>
    run(async () => {
      const ok = await createReference({ title: rawText, source_capture_id: clientId });
      if (!ok) return false;
      await setCaptureStatus(clientId, "processed");
      return true;
    });
  const addAction = () =>
    run(async () => {
      const action = await createAction({
        title,
        context_id: contextId,
        is_two_minute: twoMin,
        source_capture_id: clientId,
      });
      if (!action) return false;
      await setCaptureStatus(clientId, "processed");
      return true;
    });
  const addProject = () =>
    run(async () => {
      // Project first, then its first action — both idempotent per source capture, so a crash
      // anywhere in between converges on retry instead of duplicating.
      const project = await createProject({ title: projectTitle, source_capture_id: clientId });
      if (!project) return false;
      const action = await createAction({
        title: firstAction,
        context_id: contextId,
        project_id: project.id,
        source_capture_id: clientId,
      });
      if (!action) return false;
      await setCaptureStatus(clientId, "processed");
      return true;
    });
  const addWaiting = () =>
    run(async () => {
      const action = await createAction({
        title,
        status: "waiting",
        waiting_on_text: waitingOn,
        source_capture_id: clientId,
      });
      if (!action) return false;
      await setCaptureStatus(clientId, "processed");
      return true;
    });

  return (
    <div className="mt-3 rounded-[10px] border border-border bg-surface-2 p-3">
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {step === "ask" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Is it actionable?</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep("yes")} className="btn-accent rounded-lg px-4 py-2 text-sm font-medium">
              Yes, it&apos;s a next action
            </button>
            <button
              type="button"
              onClick={() => setStep("no")}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
            >
              No
            </button>
          </div>
        </div>
      )}

      {step === "no" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Not actionable. Where does it go?</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" disabled={busy} onClick={someday} className="rounded-lg border border-border px-4 py-2 transition-colors hover:border-border-strong hover:text-foreground">
              Someday / Maybe
            </button>
            <button type="button" disabled={busy} onClick={reference} className="rounded-lg border border-border px-4 py-2 transition-colors hover:border-border-strong hover:text-foreground">
              Reference
            </button>
            <button type="button" disabled={busy} onClick={trash} className="rounded-lg border border-border px-4 py-2 transition-colors hover:border-danger hover:text-danger">
              Trash
            </button>
            <button type="button" onClick={() => setStep("ask")} className="ml-auto rounded-lg px-3 py-2 text-muted hover:text-foreground">
              Back
            </button>
          </div>
        </div>
      )}

      {step === "yes" && (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-muted" htmlFor="na-title">
            What&apos;s the next physical action? (verb-first)
          </label>
          <input
            id="na-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Email venue re: availability"
            className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-border-strong"
          />
          <ContextChips contexts={contexts} contextId={contextId} onSelect={setSelectedContextId} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={twoMin} onChange={(e) => setTwoMin(e.target.checked)} />
            Takes under 2 minutes (do it now)
          </label>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => setStep("project")}
              className="rounded-lg border border-border px-3 py-1.5 text-muted transition-colors hover:border-border-strong hover:text-foreground"
            >
              More than one step → Project
            </button>
            <button
              type="button"
              onClick={() => setStep("waiting")}
              className="rounded-lg border border-border px-3 py-1.5 text-muted transition-colors hover:border-border-strong hover:text-foreground"
            >
              On someone else → Waiting For
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 text-sm">
            <button type="button" onClick={() => setStep("ask")} className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
              Back
            </button>
            <button
              type="button"
              disabled={busy || !title.trim() || contexts.length === 0}
              onClick={addAction}
              className="btn-accent rounded-lg px-4 py-2 font-medium"
            >
              {contexts.length === 0 ? "Loading contexts…" : "Add to Next Actions"}
            </button>
          </div>
        </div>
      )}

      {step === "project" && (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-muted" htmlFor="proj-title">
            What&apos;s the outcome? (state it as already done)
          </label>
          <input
            id="proj-title"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="e.g. Maui trip booked"
            className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-border-strong"
          />
          <label className="text-sm text-muted" htmlFor="proj-first">
            And the very next physical action?
          </label>
          <input
            id="proj-first"
            value={firstAction}
            onChange={(e) => setFirstAction(e.target.value)}
            placeholder="e.g. Email venue re: availability"
            className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-border-strong"
          />
          <ContextChips contexts={contexts} contextId={contextId} onSelect={setSelectedContextId} />
          <div className="flex items-center justify-end gap-2 text-sm">
            <button type="button" onClick={() => setStep("yes")} className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
              Back
            </button>
            <button
              type="button"
              disabled={busy || !projectTitle.trim() || !firstAction.trim() || contexts.length === 0}
              onClick={addProject}
              className="btn-accent rounded-lg px-4 py-2 font-medium"
            >
              {contexts.length === 0 ? "Loading contexts…" : "Create project"}
            </button>
          </div>
        </div>
      )}

      {step === "waiting" && (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-muted" htmlFor="wf-title">
            What are you waiting for?
          </label>
          <input
            id="wf-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sarah sends the venue quote"
            className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-border-strong"
          />
          <label className="text-sm text-muted" htmlFor="wf-on">
            Who or what is it on? (optional)
          </label>
          <input
            id="wf-on"
            value={waitingOn}
            onChange={(e) => setWaitingOn(e.target.value)}
            placeholder="e.g. Sarah"
            className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-border-strong"
          />
          <div className="flex items-center justify-end gap-2 text-sm">
            <button type="button" onClick={() => setStep("yes")} className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
              Back
            </button>
            <button
              type="button"
              disabled={busy || !title.trim()}
              onClick={addWaiting}
              className="btn-accent rounded-lg px-4 py-2 font-medium"
            >
              Add to Waiting For
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
