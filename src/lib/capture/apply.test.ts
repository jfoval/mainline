/**
 * Trust-spine invariant tests — the permanent guardrails for "capture never fails".
 *
 * These exercise the PURE reducers (no DOM/IndexedDB needed) that encode the three invariants
 * the adversarial review centered on. Each test is named for the invariant it locks in, so a
 * future refactor that silently breaks one fails loudly here.
 *
 * Run: `pnpm test`
 */
import { describe, expect, it } from "vitest";
import { applyOpToClient, applyOpToServer, MAX_PLAUSIBLE_SKEW_MS } from "./apply";
import type { CaptureOp, ServerCapture } from "./types";

const NOW = Date.parse("2026-06-29T12:00:00.000Z");

/** Monotonic server_seq allocator, like the real flush. */
function seqAllocator(start = 0) {
  let n = start;
  return () => ++n;
}

function op(partial: Partial<CaptureOp> & { client_seq: number; kind: CaptureOp["kind"] }): CaptureOp {
  return {
    op_id: `op-${partial.client_seq}-${partial.kind}`,
    client_id: "cap-1",
    created_at: new Date(NOW).toISOString(),
    ...partial,
  };
}

/** Apply a create then return the resulting server row (helper for follow-on ops). */
function freshServerRow(): ServerCapture {
  const res = applyOpToServer(
    null,
    op({ client_seq: 1, kind: "create", raw_text: "hello", source: "web", captured_at: new Date(NOW).toISOString() }),
    NOW,
    seqAllocator(),
  );
  if (!res.row) throw new Error("create should produce a row");
  return res.row;
}

describe("applyOpToServer — invariant 1: idempotent + in-order", () => {
  it("creates a fresh row with server-stamped ordering fields", () => {
    const res = applyOpToServer(
      null,
      op({ client_seq: 1, kind: "create", raw_text: "hello", source: "web" }),
      NOW,
      seqAllocator(),
    );
    expect(res.applied).toBe(true);
    expect(res.row).toMatchObject({ raw_text: "hello", status: "inbox", client_seq: 1, version: 1, server_seq: 1 });
    expect(res.row?.synced_at).toBe(new Date(NOW).toISOString());
  });

  it("ignores a duplicate/stale op whose client_seq <= current (retry safety)", () => {
    const row = freshServerRow(); // client_seq = 1
    const res = applyOpToServer(row, op({ client_seq: 1, kind: "edit", raw_text: "STALE" }), NOW, seqAllocator(1));
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("stale_seq");
    expect(res.row?.raw_text).toBe("hello"); // unchanged
  });

  it("applies an in-order edit and bumps version + client_seq", () => {
    const row = freshServerRow();
    const res = applyOpToServer(row, op({ client_seq: 2, kind: "edit", raw_text: "edited" }), NOW, seqAllocator(1));
    expect(res.applied).toBe(true);
    expect(res.row).toMatchObject({ raw_text: "edited", client_seq: 2, version: 2 });
  });

  it("keeps server_seq stable across edits (edits never reorder the inbox)", () => {
    const row = freshServerRow(); // server_seq 1
    const alloc = seqAllocator(5); // would hand out 6,7,... if called
    const res = applyOpToServer(row, op({ client_seq: 2, kind: "edit", raw_text: "x" }), NOW, alloc);
    expect(res.row?.server_seq).toBe(row.server_seq); // unchanged, allocator not consulted
  });
});

describe("applyOpToServer — invariant 2: tombstone, no resurrection", () => {
  it("delete tombstones the row", () => {
    const row = freshServerRow();
    const res = applyOpToServer(row, op({ client_seq: 2, kind: "delete" }), NOW, seqAllocator(1));
    expect(res.applied).toBe(true);
    expect(res.row?.status).toBe("discarded");
  });

  it("ignores a later edit / create / set_status after discard (no resurrect)", () => {
    let row = freshServerRow();
    row = applyOpToServer(row, op({ client_seq: 2, kind: "delete" }), NOW, seqAllocator(1)).row!;
    for (const next of [
      op({ client_seq: 3, kind: "edit", raw_text: "RESURRECT" }),
      op({ client_seq: 4, kind: "create", raw_text: "RESURRECT" }),
      op({ client_seq: 5, kind: "set_status", status: "inbox" }),
    ]) {
      const res = applyOpToServer(row, next, NOW, seqAllocator(1));
      expect(res.applied).toBe(false);
      expect(res.reason).toBe("tombstoned");
      expect(res.row?.status).toBe("discarded");
      expect(res.row?.raw_text).toBe("hello");
    }
  });
});

describe("applyOpToServer — invariant 3: server clock + skew", () => {
  it("records negative skew for a slightly-behind device clock and preserves captured_at", () => {
    const captured = new Date(NOW - 60_000).toISOString(); // device 60s behind
    const res = applyOpToServer(null, op({ client_seq: 1, kind: "create", raw_text: "h", captured_at: captured }), NOW, seqAllocator());
    expect(res.row?.skew_ms).toBe(-60_000);
    expect(res.row?.captured_at).toBe(captured); // plausible — kept
  });

  it("clamps an implausible far-future captured_at to the server clock", () => {
    const captured = new Date(NOW + MAX_PLAUSIBLE_SKEW_MS + 60_000).toISOString();
    const res = applyOpToServer(null, op({ client_seq: 1, kind: "create", raw_text: "h", captured_at: captured }), NOW, seqAllocator());
    expect(res.row?.captured_at).toBe(new Date(NOW).toISOString()); // clamped
    expect(res.row?.skew_ms).toBeGreaterThan(MAX_PLAUSIBLE_SKEW_MS); // drift still recorded
  });
});

describe("applyOpToServer — orphan ops", () => {
  it("ignores a non-create op when no row exists yet", () => {
    const res = applyOpToServer(null, op({ client_seq: 2, kind: "edit", raw_text: "x" }), NOW, seqAllocator());
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("orphan_op");
    expect(res.row).toBeNull();
  });
});

describe("applyOpToClient — mirrors server invariants for the optimistic view", () => {
  it("creates a pending row with null server fields", () => {
    const c = applyOpToClient(null, op({ client_seq: 1, kind: "create", raw_text: "hi" }));
    expect(c).toMatchObject({ raw_text: "hi", status: "inbox", pending: true, client_seq: 1, server_seq: null, synced_at: null });
  });

  it("applies an in-order edit and marks pending", () => {
    const created = applyOpToClient(null, op({ client_seq: 1, kind: "create", raw_text: "hi" }));
    const edited = applyOpToClient(created, op({ client_seq: 2, kind: "edit", raw_text: "bye" }));
    expect(edited).toMatchObject({ raw_text: "bye", version: 2, pending: true });
  });

  it("ignores stale ops and never resurrects a discarded row", () => {
    const created = applyOpToClient(null, op({ client_seq: 1, kind: "create", raw_text: "hi" }));
    const deleted = applyOpToClient(created, op({ client_seq: 2, kind: "delete" }));
    expect(deleted.status).toBe("discarded");
    const resurrect = applyOpToClient(deleted, op({ client_seq: 3, kind: "edit", raw_text: "back" }));
    expect(resurrect).toBe(deleted); // unchanged reference — ignored
    const stale = applyOpToClient(created, op({ client_seq: 1, kind: "edit", raw_text: "x" }));
    expect(stale).toBe(created);
  });

  it("throws if the first op for a capture is not a create", () => {
    expect(() => applyOpToClient(null, op({ client_seq: 2, kind: "edit", raw_text: "x" }))).toThrow();
  });
});
