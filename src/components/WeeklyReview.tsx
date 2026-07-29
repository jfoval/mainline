"use client";

/**
 * The Weekly Review — GTD's keystone habit (FOUNDATIONS §2), guided one screen at a time:
 *
 *   1. Inbox to zero   — including the inboxes that live outside this app.
 *   2. Projects        — every active project has a mover. A stalled one BLOCKS the step:
 *                        GTD's cardinal rule is a decision, not a notification.
 *   3. Horizons        — ONCE A MONTH only: purpose/vision/goals/areas beside the project list.
 *   4. Waiting For     — what's aging on someone else.
 *   5. Someday / Maybe — still want it? Then pull it forward, or let it go.
 *
 * Each step reuses the real list component, so a decision made here is the same write the
 * normal view makes — no review-only shadow state. Finishing stamps one write-once
 * `review_sessions` row; "last reviewed" goes amber at a week. No streaks, no confetti.
 */
import { useState } from "react";
import { usePendingDiscards } from "@/lib/capture/pending-discard";
import { useCaptures } from "@/lib/capture/store";
import {
  completeReview,
  useActions,
  useLastReviewedAt,
  useProjects,
  useReviewCompletions,
} from "@/lib/gtd/store";
import {
  dayKey,
  isFirstReviewOfMonth,
  projectNeedsNextAction,
  resurfacedActions,
  reviewFreshness,
} from "@/lib/gtd/views";
import { useHydrated } from "@/lib/use-hydrated";
import { HorizonsEditor } from "./HorizonsEditor";
import { InboxList } from "./InboxList";
import { ProjectsList } from "./ProjectsList";
import { SomedayList } from "./SomedayList";
import { WaitingList } from "./WaitingList";

type Step = "inbox" | "projects" | "horizons" | "waiting" | "someday";

const TITLES: Record<Step, string> = {
  inbox: "Empty the inbox",
  projects: "Every project has a mover",
  horizons: "Do these still point the same way?",
  waiting: "What are you waiting on?",
  someday: "Someday / Maybe: still want it?",
};

/** Once a month the review gains a fifth step: the horizons, next to the project list. */
function stepsFor(withHorizons: boolean): Step[] {
  return withHorizons
    ? ["inbox", "projects", "horizons", "waiting", "someday"]
    : ["inbox", "projects", "waiting", "someday"];
}

export function WeeklyReview() {
  const completions = useReviewCompletions();
  const [startedAt, setStartedAt] = useState<string | null>(null);
  // Frozen when the review STARTS, not per render: finishing writes this month's first
  // completion, and the step list must not shuffle underneath you at the finish line.
  const [steps, setSteps] = useState<Step[]>(() => stepsFor(false));
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFinished(false);
    setStartedAt(null);
    setIndex(0);
    setError(null);
  }

  function start() {
    setSteps(stepsFor(isFirstReviewOfMonth(completions, new Date())));
    setStartedAt(new Date().toISOString());
  }

  if (finished) return <FinishedCard onAgain={reset} />;
  if (!startedAt) return <StartCard completions={completions} onStart={start} />;

  const step = steps[index];
  const isLast = index === steps.length - 1;

  async function finish() {
    if (busy || !startedAt) return;
    setBusy(true);
    setError(null);
    const ok = await completeReview(startedAt);
    setBusy(false);
    if (!ok) {
      setError("Couldn't record the review on this device. Try again.");
      return;
    }
    setFinished(true);
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <StepHeader index={index} step={step} steps={steps} />
      <StepBody step={step} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <StepFooter
        step={step}
        isLast={isLast}
        busy={busy}
        onBack={() => (index === 0 ? reset() : setIndex(index - 1))}
        onNext={() => (isLast ? void finish() : setIndex(index + 1))}
      />
    </div>
  );
}

/** The pre-flight screen: when you last reviewed, what the steps are, one button. */
function StartCard({
  completions,
  onStart,
}: {
  completions: readonly string[];
  onStart: () => void;
}) {
  const lastReviewedAt = useLastReviewedAt();
  const hydrated = useHydrated();
  // Server render can't know the local stamp — hold the line until hydration so it never
  // flashes "Not reviewed yet" at someone who reviewed yesterday.
  const freshness = hydrated ? reviewFreshness(lastReviewedAt, new Date()) : null;
  // Same hydration caution: before the local rows load, don't promise a horizons step.
  const steps = stepsFor(hydrated && isFirstReviewOfMonth(completions, new Date()));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <p className={`text-sm ${freshness?.due ? "text-warning" : "text-muted"}`}>
        {freshness?.label ?? " "}
      </p>

      <ol className="flex flex-col divide-y divide-border rounded-[10px] border border-border bg-surface">
        {steps.map((s, i) => (
          <li key={s} className="flex items-baseline gap-3 px-4 py-3">
            <span className="text-xs text-tertiary tabular-nums">{i + 1}</span>
            <span className="text-[15px]">{TITLES[s]}</span>
          </li>
        ))}
      </ol>

      <button type="button" onClick={onStart} className="btn-accent self-start rounded-lg px-5 py-2.5 font-medium">
        Start review
      </button>
    </div>
  );
}

function FinishedCard({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-lg font-medium">Review complete</p>
      <p className="max-w-sm text-sm text-muted">
        Your system is current. Mainline stamped today, and you&apos;ll see it turn amber in a week.
      </p>
      <button
        type="button"
        onClick={onAgain}
        className="mt-2 rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        Back to the start
      </button>
    </div>
  );
}

function StepHeader({ index, step, steps }: { index: number; step: Step; steps: Step[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2" aria-hidden>
        {steps.map((s, i) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full ${i <= index ? "bg-accent" : "bg-surface-2"}`}
          />
        ))}
      </div>
      <p className="text-xs text-tertiary">
        Step {index + 1} of {steps.length}
      </p>
      <h2 className="text-xl font-semibold tracking-tight">{TITLES[step]}</h2>
    </div>
  );
}

function StepBody({ step }: { step: Step }) {
  switch (step) {
    case "inbox":
      return (
        <div className="flex flex-col gap-4">
          <p className="rounded-[10px] border border-border bg-surface p-3 text-[15px] leading-relaxed text-muted">
            Empty your <em className="not-italic text-foreground">other</em> inboxes into Mainline
            first: the physical tray, email, notes app, camera roll, anything you scribbled on.
            Then clarify each item below until nothing is left.
          </p>
          <InboxList />
        </div>
      );
    case "projects":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-muted">
            Read each outcome and check that something is actually moving it. Anything stalled has
            to be decided here. Name the next action, or mark the project complete.
          </p>
          <ProjectsList />
        </div>
      );
    case "horizons":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-muted">
            Once a month, look up. Read these next to the projects you just went through. If a
            project serves none of them, or a goal has no project under it, that&apos;s the
            interesting part.
          </p>
          <HorizonsEditor compact />
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Your active projects
            </h3>
            <ProjectTitles />
          </div>
        </div>
      );
    case "waiting":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-muted">
            Oldest first. Anything gone quiet is either done, or yours to chase again.
          </p>
          <WaitingList />
        </div>
      );
    case "someday":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-muted">
            A quick scan, not a commitment. Pull anything forward whose time has come, and drop
            what you know you&apos;ll never do.
          </p>
          <SomedayList />
        </div>
      );
  }
}

/** Just the outcomes, read as a list — the horizons step is for comparing, not for editing. */
function ProjectTitles() {
  const projects = useProjects();
  const active = projects.filter((p) => p.status === "active");
  if (active.length === 0) return <p className="text-sm text-tertiary">No active projects.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border bg-surface">
      {active.map((p) => (
        <li key={p.id} className="px-4 py-2.5 text-[15px]">
          {p.title}
        </li>
      ))}
    </ul>
  );
}

/**
 * Back / Next. The projects step is the one gate in the flow: it can't be passed while a
 * project has nothing actionable (that's the whole point of reviewing projects). The inbox
 * step counts what's left but never blocks — trapping someone behind a 40-item inbox would
 * just teach them to skip the review.
 */
function StepFooter({
  step,
  isLast,
  busy,
  onBack,
  onNext,
}: {
  step: Step;
  isLast: boolean;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const projects = useProjects();
  const actions = useActions();
  const captures = useCaptures();
  const pending = usePendingDiscards();

  const stalled =
    step === "projects"
      ? projects.filter((p) => projectNeedsNextAction(p, actions)).length
      : 0;
  const inboxLeft =
    step === "inbox"
      ? captures.filter((c) => c.status === "inbox" && !pending.has(c.client_id)).length +
        resurfacedActions(actions, dayKey(new Date())).length
      : 0;

  const blocked = stalled > 0;
  const note = blocked
    ? `${stalled} project${stalled === 1 ? "" : "s"} still without a next action.`
    : inboxLeft > 0
      ? `${inboxLeft} still in the inbox. A review works best from zero.`
      : null;

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
      {note && <p className={`text-sm ${blocked ? "text-warning" : "text-muted"}`}>{note}</p>}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          Back
        </button>
        <button
          type="button"
          disabled={blocked || busy}
          onClick={onNext}
          className="btn-accent rounded-lg px-5 py-2.5 font-medium"
        >
          {isLast ? "Finish review" : "Next"}
        </button>
      </div>
    </div>
  );
}
