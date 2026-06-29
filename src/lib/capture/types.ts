/**
 * Capture trust-spine types (Phase 1).
 *
 * Mirrors DATA-MODEL.md §"trust spine" + the `captures` table. Captures are MUTABLE
 * (status / edit / delete) — modeled as an ordered, per-capture sequenced op-log, applied
 * idempotently and in sequence so a late stale op can never resurrect a discarded capture.
 */

/** captures.status — Phase 1 mostly uses `inbox` and `discarded`. */
export type CaptureStatus = "inbox" | "clarifying" | "processed" | "discarded";

/** captures.source — where the capture originated. */
export type CaptureSource =
  | "web"
  | "ios_pwa"
  | "android_pwa"
  | "watch"
  | "shortcut"
  | "share_sheet"
  | "email"
  | "api";

/** captures.audio_status — two-phase audio handshake (audio itself deferred to P1.5). */
export type AudioStatus = "none" | "pending" | "uploading" | "stored" | "failed";

/** The four op kinds in the per-capture op-log. */
export type OpKind = "create" | "edit" | "set_status" | "delete";

/**
 * A single operation against one capture (identified by `client_id`).
 * `client_seq` is the per-capture monotonic sequence — the server ignores any op whose
 * `client_seq` ≤ the row's current sequence (idempotent + in-order).
 */
export interface CaptureOp {
  /** uuid — op-level idempotency (a retried flush re-sends the same op_id). */
  op_id: string;
  /** uuid — the capture this op targets; generated on-device before any network. */
  client_id: string;
  /** per-capture monotonic sequence (create=1, then 2, 3, …). */
  client_seq: number;
  kind: OpKind;

  // ---- payload (varies by kind) ----
  /** create | edit */
  raw_text?: string;
  /** set_status */
  status?: CaptureStatus;
  /** create */
  source?: CaptureSource;
  /** create — device clock (ISO). DISPLAY ONLY; never used for authoritative ordering. */
  captured_at?: string;

  /** when this op was enqueued on-device (ISO) — debug + skew observability. */
  created_at: string;
}

/**
 * Materialized client view of a capture (what the UI renders). Optimistically updated the
 * instant an op is enqueued, then reconciled with server-authoritative fields on ack.
 */
export interface Capture {
  client_id: string;
  raw_text: string;
  source: CaptureSource;
  status: CaptureStatus;
  audio_status: AudioStatus;

  /** device clock (ISO) — DISPLAY ONLY. */
  captured_at: string;
  /** server clock (ISO) — authoritative; null until first synced. */
  synced_at: string | null;
  /** server monotonic order key — authoritative inbox ordering; null until synced. */
  server_seq: number | null;
  /** recorded device−server delta (ms); null until synced. */
  skew_ms: number | null;

  /** last op sequence applied on the client. */
  client_seq: number;
  /** optimistic-concurrency version (bumped each applied op). */
  version: number;

  /** true while this capture has unsynced ops in the outbound queue. */
  pending: boolean;
}

/**
 * Authoritative server representation of a capture. In Phase 1 the LocalOnlyAdapter keeps
 * these in a local "server" store so the full idempotent/in-sequence/tombstone contract is
 * genuinely exercised; the SupabaseAdapter (step 5) replaces the transport, not this shape.
 */
export interface ServerCapture {
  client_id: string;
  raw_text: string;
  source: CaptureSource;
  status: CaptureStatus;
  audio_status: AudioStatus;
  captured_at: string;
  /** server clock (ISO) — authoritative. */
  synced_at: string;
  /** server monotonic order key. */
  server_seq: number;
  skew_ms: number;
  /** current applied op sequence on the server. */
  client_seq: number;
  version: number;
}
