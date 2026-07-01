/**
 * SupabaseAdapter — the real backend transport for the capture trust spine (PHASE-1 step 5).
 *
 * It is the network twin of LocalOnlyAdapter: same drain-the-oplog / return-acks / pullState
 * contract, but the authoritative apply happens in Postgres via the `sync_capture_ops` RPC
 * (which mirrors applyOpToServer 1:1, scoped to auth.uid() by RLS). The client-side apply logic
 * is untouched — only the transport changes.
 *
 * NO-LOSS / NO-DUP invariant (why network-then-delete is safe without a distributed txn):
 *   1. Ops stay durably in IndexedDB until the RPC returns success; a failed/interrupted flush
 *      leaves the queue intact, so nothing is ever lost.
 *   2. The RPC is idempotent + in-order (ignores client_seq ≤ the row's current seq, tombstone
 *      terminal). So if we crash AFTER the server applied but BEFORE we deleted the local ops,
 *      the next flush re-sends them and the server safely ignores the stale ones — no duplicates.
 *   3. We delete EXACTLY the op keys we sent (captured before the RPC), never ops enqueued
 *      mid-flush — those ride the next flush.
 */
import { getDB } from "./db";
import { getSupabase } from "@/lib/supabase/client";
import type { FlushResult, OpAck, SyncAdapter } from "./sync-adapter";
import type { CaptureOp, ServerCapture } from "./types";

/** One row as returned by the RPC / a captures select (Postgres → JSON). */
interface CaptureRow {
  client_id: string;
  raw_text: string;
  source: string;
  status: string;
  audio_status: string;
  captured_at: string;
  synced_at: string;
  server_seq: number | string; // bigint identity — coerce
  skew_ms: number | null;
  client_seq: number;
  version: number;
}

/** Map an authoritative Postgres row to the app's ServerCapture shape. */
function toServerCapture(r: CaptureRow): ServerCapture {
  return {
    client_id: r.client_id,
    raw_text: r.raw_text,
    source: r.source as ServerCapture["source"],
    status: r.status as ServerCapture["status"],
    audio_status: r.audio_status as ServerCapture["audio_status"],
    captured_at: r.captured_at,
    synced_at: r.synced_at,
    server_seq: Number(r.server_seq),
    skew_ms: r.skew_ms ?? 0,
    client_seq: r.client_seq,
    version: r.version,
  };
}

/** Shape one op for the RPC. captured_at/skew_ms are computed server-side, never trusted here.
 *  created_at is sent so the RPC can fall back to it for skew when captured_at is absent (parity
 *  with applyOpToServer). */
function toOpPayload(op: CaptureOp): Record<string, unknown> {
  return {
    client_id: op.client_id,
    client_seq: op.client_seq,
    kind: op.kind,
    raw_text: op.raw_text,
    status: op.status,
    source: op.source,
    captured_at: op.captured_at,
    created_at: op.created_at,
  };
}

export class SupabaseAdapter implements SyncAdapter {
  readonly name = "supabase";

  async flush(): Promise<FlushResult> {
    // Snapshot the queue (keys + values) in one read tx. Auto-increment keys only grow, so the
    // keys we capture here can never collide with ops enqueued after this point.
    const db = await getDB();
    const readTx = db.transaction("oplog", "readonly");
    const store = readTx.objectStore("oplog");
    const [keys, ops] = await Promise.all([store.getAllKeys(), store.getAll()]);
    await readTx.done;

    if (ops.length === 0) return { ok: true, acks: [] };

    // Push the whole ordered batch to the authoritative store.
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("sync_capture_ops", {
      p_ops: ops.map(toOpPayload),
    });

    if (error) {
      // Transient (offline / auth-not-ready / server error). Leave the queue untouched so the
      // engine backs off and retries — NO-LOSS invariant (1).
      return { ok: false, acks: [], error: error.message };
    }

    // The RPC returns the authoritative row for each touched capture (final state after the
    // batch). The sync engine reconciles by client_id, so one ack per returned row suffices.
    const rows = (data ?? []) as CaptureRow[];
    const serverByClient = new Map<string, ServerCapture>();
    for (const row of rows) serverByClient.set(row.client_id, toServerCapture(row));

    const acks: OpAck[] = ops.map((op) => {
      const server = serverByClient.get(op.client_id) ?? null;
      return {
        client_id: op.client_id,
        client_seq: op.client_seq,
        // `applied` is a heuristic and `reason` is intentionally omitted: this transport can't
        // cheaply distinguish stale/tombstoned/orphan the way LocalOnlyAdapter does. It's fine
        // because sync-engine.reconcile() folds `server` (the authoritative row) and never reads
        // these two fields. A returned row whose seq reached this op means it (or a later op)
        // landed; no row means orphan.
        applied: server != null && server.client_seq >= op.client_seq,
        server,
      };
    });

    // Success — now delete exactly the ops we sent. A crash before this is safe: re-send is a
    // no-op server-side (idempotent), NO-DUP invariant (2).
    const delTx = db.transaction("oplog", "readwrite");
    const delStore = delTx.objectStore("oplog");
    await Promise.all(keys.map((k) => delStore.delete(k)));
    await delTx.done;

    return { ok: true, acks };
  }

  async pullState(): Promise<ServerCapture[]> {
    const supabase = getSupabase();
    // RLS scopes this to the current user. Ascending server_seq (server-clock ordering); the UI
    // re-sorts as it likes. Includes discarded rows so a cross-device delete propagates here.
    const { data, error } = await supabase
      .from("captures")
      .select("*")
      .order("server_seq", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as CaptureRow[]).map(toServerCapture);
  }
}
