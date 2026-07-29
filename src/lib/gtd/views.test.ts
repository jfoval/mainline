import { describe, expect, it } from "vitest";
import type { Action, Project } from "./types";
import {
  currentActionFor,
  dayKey,
  dayKeyPlus,
  isDeferred,
  isFirstReviewOfMonth,
  openActionsFor,
  projectNeedsNextAction,
  projectProgress,
  resurfaceLabel,
  resurfacedActions,
  reviewFreshness,
  waitingAgeLabel,
} from "./views";

function action(overrides: Partial<Action>): Action {
  return {
    id: "a1",
    title: "Do the thing",
    context_id: null,
    project_id: null,
    status: "active",
    is_two_minute: false,
    energy: null,
    waiting_on_text: null,
    waiting_since: null,
    source_capture_id: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    sort_order: 1,
    resurface_on: null,
    notes: null,
    ...overrides,
  };
}

function project(overrides: Partial<Project>): Project {
  return {
    id: "p1",
    title: "Ship the release",
    status: "active",
    source_capture_id: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    sort_order: 1,
    notes: null,
    ...overrides,
  };
}

describe("projectNeedsNextAction", () => {
  it("flags an active project with no actions at all", () => {
    expect(projectNeedsNextAction(project({}), [])).toBe(true);
  });

  it("flags a project whose only actions are done or dropped", () => {
    const acts = [
      action({ id: "a1", project_id: "p1", status: "done" }),
      action({ id: "a2", project_id: "p1", status: "dropped" }),
    ];
    expect(projectNeedsNextAction(project({}), acts)).toBe(true);
  });

  it("does not flag when an active action exists", () => {
    const acts = [action({ project_id: "p1", status: "active" })];
    expect(projectNeedsNextAction(project({}), acts)).toBe(false);
  });

  it("does not flag when a waiting item exists (waiting counts as movement)", () => {
    const acts = [action({ project_id: "p1", status: "waiting" })];
    expect(projectNeedsNextAction(project({}), acts)).toBe(false);
  });

  it("ignores other projects' actions", () => {
    const acts = [action({ project_id: "other", status: "active" })];
    expect(projectNeedsNextAction(project({}), acts)).toBe(true);
  });

  it("never flags a non-active project", () => {
    expect(projectNeedsNextAction(project({ status: "completed" }), [])).toBe(false);
  });
});

describe("currentActionFor", () => {
  it("returns the oldest active action", () => {
    const acts = [
      action({ id: "new", project_id: "p1", sort_order: 20 }),
      action({ id: "old", project_id: "p1", sort_order: 10 }),
    ];
    expect(currentActionFor("p1", acts)?.id).toBe("old");
  });

  it("prefers an active action over an older waiting one", () => {
    const acts = [
      action({ id: "w", project_id: "p1", status: "waiting", sort_order: 1 }),
      action({ id: "a", project_id: "p1", status: "active", sort_order: 99 }),
    ];
    expect(currentActionFor("p1", acts)?.id).toBe("a");
  });

  it("falls back to the oldest waiting item, and null when nothing is actionable", () => {
    const acts = [
      action({ id: "w2", project_id: "p1", status: "waiting", sort_order: 5 }),
      action({ id: "w1", project_id: "p1", status: "waiting", sort_order: 2 }),
      action({ id: "d", project_id: "p1", status: "done", sort_order: 1 }),
    ];
    expect(currentActionFor("p1", acts)?.id).toBe("w1");
    expect(currentActionFor("p2", acts)).toBeNull();
  });
});

describe("openActionsFor", () => {
  it("returns active + waiting items for the project, oldest first, skipping done/dropped", () => {
    const acts = [
      action({ id: "new", project_id: "p1", status: "active", sort_order: 30 }),
      action({ id: "w", project_id: "p1", status: "waiting", sort_order: 20 }),
      action({ id: "old", project_id: "p1", status: "active", sort_order: 10 }),
      action({ id: "d", project_id: "p1", status: "done", sort_order: 5 }),
      action({ id: "other", project_id: "p2", status: "active", sort_order: 1 }),
    ];
    expect(openActionsFor("p1", acts).map((a) => a.id)).toEqual(["old", "w", "new"]);
  });
});

describe("projectProgress", () => {
  it("counts done vs standing items and ignores dropped ones", () => {
    const acts = [
      action({ id: "a", project_id: "p1", status: "done" }),
      action({ id: "b", project_id: "p1", status: "active" }),
      action({ id: "c", project_id: "p1", status: "waiting" }),
      action({ id: "x", project_id: "p1", status: "dropped" }),
      action({ id: "o", project_id: "p2", status: "done" }),
    ];
    expect(projectProgress("p1", acts)).toEqual({ done: 1, total: 3 });
    expect(projectProgress("empty", acts)).toEqual({ done: 0, total: 0 });
  });
});

describe("waitingAgeLabel", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");

  it("labels same-day as today", () => {
    expect(waitingAgeLabel("2026-07-27T08:00:00.000Z", now)).toBe("today");
  });

  it("labels one and many days", () => {
    expect(waitingAgeLabel("2026-07-26T08:00:00.000Z", now)).toBe("1 day");
    expect(waitingAgeLabel("2026-07-20T08:00:00.000Z", now)).toBe("7 days");
  });

  it("is empty for a malformed timestamp and 'today' for a future one", () => {
    expect(waitingAgeLabel("not-a-date", now)).toBe("");
    expect(waitingAgeLabel("2026-08-01T00:00:00.000Z", now)).toBe("today");
  });
});

describe("reviewFreshness", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("treats never-reviewed as due", () => {
    expect(reviewFreshness(null, now)).toEqual({ label: "Not reviewed yet", due: true });
  });

  it("reads fresh up to six days and goes due at seven", () => {
    expect(reviewFreshness("2026-07-29T08:00:00.000Z", now)).toEqual({
      label: "Last reviewed today",
      due: false,
    });
    expect(reviewFreshness("2026-07-28T08:00:00.000Z", now)).toEqual({
      label: "Last reviewed yesterday",
      due: false,
    });
    expect(reviewFreshness("2026-07-23T13:00:00.000Z", now)).toEqual({
      label: "Last reviewed 5 days ago",
      due: false,
    });
    expect(reviewFreshness("2026-07-22T11:00:00.000Z", now)).toEqual({
      label: "Last reviewed 7 days ago",
      due: true,
    });
  });

  it("degrades to due on a malformed or future stamp", () => {
    expect(reviewFreshness("not-a-date", now).due).toBe(true);
    expect(reviewFreshness("2026-08-05T00:00:00.000Z", now).due).toBe(true);
  });
});

describe("tickler dates", () => {
  it("builds local day keys, including across a month boundary", () => {
    // Local-time constructor on purpose: the key must be the user's calendar day.
    expect(dayKey(new Date(2026, 7, 9, 23, 30))).toBe("2026-08-09");
    expect(dayKeyPlus(new Date(2026, 6, 29), 3)).toBe("2026-08-01");
    expect(dayKeyPlus(new Date(2026, 11, 31), 1)).toBe("2027-01-01");
  });

  it("defers only future dates", () => {
    const today = "2026-07-29";
    expect(isDeferred(action({ resurface_on: "2026-07-30" }), today)).toBe(true);
    expect(isDeferred(action({ resurface_on: "2026-07-29" }), today)).toBe(false);
    expect(isDeferred(action({ resurface_on: null }), today)).toBe(false);
  });

  it("resurfaces due items oldest-date first, ignoring done/dropped/waiting ones", () => {
    const today = "2026-07-29";
    const acts = [
      action({ id: "b", resurface_on: "2026-07-29", status: "someday" }),
      action({ id: "a", resurface_on: "2026-07-20", status: "active" }),
      action({ id: "future", resurface_on: "2026-08-20", status: "active" }),
      action({ id: "done", resurface_on: "2026-07-01", status: "done" }),
      action({ id: "plain", resurface_on: null, status: "active" }),
    ];
    expect(resurfacedActions(acts, today).map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("labels a pending date in human terms", () => {
    const today = "2026-07-29";
    expect(resurfaceLabel("2026-07-29", today)).toBe("today");
    expect(resurfaceLabel("2026-07-30", today)).toBe("tomorrow");
    expect(resurfaceLabel("2026-08-01", today)).toBe("in 3 days");
    expect(resurfaceLabel("2026-08-20", today)).toBe("20 Aug");
    expect(resurfaceLabel("garbage", today)).toBe("garbage");
  });
});

describe("isFirstReviewOfMonth", () => {
  const now = new Date(2026, 7, 14); // 14 Aug 2026, local

  it("is true with no reviews at all", () => {
    expect(isFirstReviewOfMonth([], now)).toBe(true);
  });

  it("is true when the only reviews were in earlier months", () => {
    expect(isFirstReviewOfMonth([new Date(2026, 6, 31).toISOString()], now)).toBe(true);
    expect(isFirstReviewOfMonth([new Date(2025, 7, 14).toISOString()], now)).toBe(true);
  });

  it("is false once a review lands in the same month", () => {
    expect(isFirstReviewOfMonth([new Date(2026, 7, 1).toISOString()], now)).toBe(false);
  });

  it("ignores unparseable stamps", () => {
    expect(isFirstReviewOfMonth(["nonsense"], now)).toBe(true);
  });
});
