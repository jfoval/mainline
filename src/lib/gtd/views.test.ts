import { describe, expect, it } from "vitest";
import type { Action, Project } from "./types";
import { currentActionFor, projectNeedsNextAction, waitingAgeLabel } from "./views";

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
