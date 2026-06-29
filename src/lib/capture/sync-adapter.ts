/**
 * The Clarify/Sync seam for capture (PHASE-1 §step 2). The app codes against this interface
 * so local-first works immediately; swapping LocalOnlyAdapter → SupabaseAdapter (step 5) is
 * a transport change only.
 *
 * Note on `enqueue`: PHASE-1 sketched the seam as enqueue/flush/pullState. Durable enqueue is
 * instead handled by the store's `commitLocalOp`, which writes the optimistic capture and its
 * op in ONE IndexedDB transaction — atomic, so a capture can never be shown-but-unqueued or
 * queued-but-unshown. The adapter therefore owns only the network-facing half: drain the
 * queue (`flush`) and read authoritative state (`pullState`).
 */
import type { ServerCapture } from "./types";

/** Per-op result of a flush. `applied=false` means the server ignored it (stale/tombstoned). */
export interface OpAck {
  client_id: string;
  client_seq: number;
  applied: boolean;
  reason?: string;
  /** authoritative row after applying this op (null only for an ignored orphan op). */
  server: ServerCapture | null;
}

export interface FlushResult {
  /** false => transient failure; the engine should back off and retry (queue is untouched). */
  ok: boolean;
  acks: OpAck[];
  error?: string;
}

export interface SyncAdapter {
  readonly name: string;
  /** Push all queued ops to the server, idempotently and in sequence. */
  flush(): Promise<FlushResult>;
  /** Authoritative server snapshot, ordered by server_seq (server-clock ordering). */
  pullState(): Promise<ServerCapture[]>;
}
