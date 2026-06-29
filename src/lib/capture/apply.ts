/**
 * Pure op-apply logic — the heart of the trust spine.
 *
 * `applyOpToServer` is the canonical, side-effect-free reducer the authoritative store
 * uses. It is deliberately pure so it can be (a) reused verbatim by the LocalOnlyAdapter's
 * simulated server, (b) re-implemented 1:1 by the future Supabase sync endpoint, and
 * (c) exhaustively unit-tested. The three invariants it enforces (DATA-MODEL §trust spine):
 *
 *   1. IDEMPOTENT + IN-ORDER — ignore any op with client_seq ≤ the row's current seq.
 *   2. TOMBSTONE — once status='discarded', no op resurrects the row.
 *   3. SERVER CLOCK — synced_at/server_seq are server-stamped; captured_at is display-only,
 *      and skew_ms records device drift.
 */
import type { Capture, CaptureOp, ServerCapture } from "./types";

/** captured_at further in the future than this beyond server "now" is implausible (clock skew). */
export const MAX_PLAUSIBLE_SKEW_MS = 5 * 60 * 1000;

export interface ApplyResult {
  /** The row after applying (unchanged if the op was ignored). null only if an op other
   *  than `create` arrives for a capture that does not yet exist. */
  row: ServerCapture | null;
  /** Whether the op mutated authoritative state (false = ignored: stale / tombstoned). */
  applied: boolean;
  /** Why it was ignored, for observability. */
  reason?: "stale_seq" | "tombstoned" | "orphan_op";
}

/**
 * Apply one op to the authoritative row (or null if it doesn't exist yet).
 *
 * @param existing  current authoritative row, or null
 * @param op        the op to apply
 * @param serverNowMs server clock in ms (authoritative)
 * @param allocSeq  allocates the next monotonic server_seq (called only on create)
 */
export function applyOpToServer(
  existing: ServerCapture | null,
  op: CaptureOp,
  serverNowMs: number,
  allocSeq: () => number,
): ApplyResult {
  const syncedAt = new Date(serverNowMs).toISOString();

  // (1) Idempotent + in-order: never apply a seq we've already passed. This is what makes
  // retries safe and what blocks a late `edit`/`create` from clobbering newer state.
  if (existing && op.client_seq <= existing.client_seq) {
    return { row: existing, applied: false, reason: "stale_seq" };
  }

  // (2) Tombstone: discarded is terminal. A delayed create/edit can't bring it back.
  if (existing && existing.status === "discarded") {
    return { row: existing, applied: false, reason: "tombstoned" };
  }

  if (!existing) {
    // Only a create can materialize a brand-new row. An edit/delete/set_status with no
    // existing row is an orphan (its create hasn't arrived) — ignore; it will be retried
    // after the create lands. With in-order per-client flushing this should not happen.
    if (op.kind !== "create") {
      return { row: null, applied: false, reason: "orphan_op" };
    }
    const capturedMs = Date.parse(op.captured_at ?? op.created_at);
    const skewMs = Number.isFinite(capturedMs) ? capturedMs - serverNowMs : 0;
    // Clamp an implausible (far-future) device clock to the server clock so a bad clock can't
    // pollute display or pre-sync ordering. skew_ms still records the real drift (invariant 3).
    const implausible = skewMs > MAX_PLAUSIBLE_SKEW_MS;
    const capturedAt = implausible ? syncedAt : op.captured_at ?? syncedAt;
    return {
      applied: true,
      row: {
        client_id: op.client_id,
        raw_text: op.raw_text ?? "",
        source: op.source ?? "web",
        status: "inbox",
        audio_status: "none",
        captured_at: capturedAt,
        synced_at: syncedAt,
        server_seq: allocSeq(),
        skew_ms: skewMs,
        client_seq: op.client_seq,
        version: 1,
      },
    };
  }

  // Mutating an existing, in-order, non-tombstoned row. server_seq is fixed at creation so
  // edits never reorder the inbox; synced_at advances to reflect the latest sync.
  const row: ServerCapture = {
    ...existing,
    client_seq: op.client_seq,
    version: existing.version + 1,
    synced_at: syncedAt,
  };
  switch (op.kind) {
    case "edit":
      if (op.raw_text !== undefined) row.raw_text = op.raw_text;
      break;
    case "set_status":
      if (op.status !== undefined) row.status = op.status;
      break;
    case "delete":
      row.status = "discarded";
      break;
    case "create":
      // Duplicate create for an existing row — idempotent no-op on content.
      break;
  }
  return { row, applied: true };
}

/**
 * Apply one op to the optimistic CLIENT view. Same invariants as the server (so the local
 * view never diverges), but it tracks `pending` and leaves server fields null until sync.
 */
export function applyOpToClient(existing: Capture | null, op: CaptureOp): Capture {
  // Idempotent + tombstone guards mirror the server.
  if (existing && (op.client_seq <= existing.client_seq || existing.status === "discarded")) {
    return existing;
  }

  if (!existing) {
    if (op.kind !== "create") {
      // Shouldn't happen on-device (create is always first). Defensive: ignore by returning
      // a minimal tombstone-free placeholder is wrong; instead, no-op is impossible without
      // an existing row, so we synthesize from the op as a create-like fallback.
      throw new Error(`applyOpToClient: first op for ${op.client_id} must be 'create'`);
    }
    return {
      client_id: op.client_id,
      raw_text: op.raw_text ?? "",
      source: op.source ?? "web",
      status: "inbox",
      audio_status: "none",
      captured_at: op.captured_at ?? op.created_at,
      synced_at: null,
      server_seq: null,
      skew_ms: null,
      client_seq: op.client_seq,
      version: 1,
      pending: true,
    };
  }

  const next: Capture = {
    ...existing,
    client_seq: op.client_seq,
    version: existing.version + 1,
    pending: true,
  };
  switch (op.kind) {
    case "edit":
      if (op.raw_text !== undefined) next.raw_text = op.raw_text;
      break;
    case "set_status":
      if (op.status !== undefined) next.status = op.status;
      break;
    case "delete":
      next.status = "discarded";
      break;
    case "create":
      break;
  }
  return next;
}
