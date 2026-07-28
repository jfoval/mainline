// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleUndo, showUndo, undoCurrent } from "./undo";

describe("undo store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    settleUndo(); // never leak a pending deferred commit between tests
    vi.useRealTimers();
  });

  it("expiry runs the deferred commit; undo does not", () => {
    const commit = vi.fn();
    const undo = vi.fn();
    showUndo({ label: "x", onUndo: undo, onExpire: commit });
    vi.advanceTimersByTime(10_000);
    expect(commit).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });

  it("undo cancels the deferred commit and runs onUndo", () => {
    const commit = vi.fn();
    const undo = vi.fn();
    showUndo({ label: "x", onUndo: undo, onExpire: commit });
    undoCurrent();
    vi.advanceTimersByTime(60_000);
    expect(undo).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it("showing a new toast settles the previous deferred commit immediately", () => {
    const firstCommit = vi.fn();
    showUndo({ label: "first", onUndo: vi.fn(), onExpire: firstCommit });
    showUndo({ label: "second", onUndo: vi.fn() });
    expect(firstCommit).toHaveBeenCalledOnce(); // rapid-fire deletes can't lose a commit
  });

  it("undo after expiry is a no-op", () => {
    const undo = vi.fn();
    showUndo({ label: "x", onUndo: undo });
    vi.advanceTimersByTime(10_000);
    undoCurrent();
    expect(undo).not.toHaveBeenCalled();
  });
});
