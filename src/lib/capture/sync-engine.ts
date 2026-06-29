/**
 * SyncEngine — drives the outbound queue in the background.
 *
 * Responsibilities:
 *   - Flush the op-log via the active SyncAdapter (debounced; never two flushes at once).
 *   - Retry transient failures with exponential backoff (1s → 30s cap), WITHOUT letting
 *     unrelated activity bypass the backoff against a failing server.
 *   - Re-flush on reconnect / tab-focus / interval.
 *   - Reconcile acks back into the materialized `captures` store ATOMICALLY and seq-guarded,
 *     so a server ack can never clobber a newer optimistic edit or regress client_seq.
 *   - Recover on startup via pullState(), so a capture is never stranded if a per-flush ack
 *     reconcile is lost to a crash/reload after the op was already consumed server-side.
 *
 * Capture durability never depends on this engine succeeding — ops are durable in IndexedDB
 * the instant they're committed. The engine only moves them to the server and folds back the
 * authoritative ordering fields.
 */
import { getAdapter } from "./adapter";
import { reconcileCapture } from "./db";
import type { OpAck } from "./sync-adapter";
import type { Capture, ServerCapture } from "./types";

type ChangeListener = (changed: Capture[]) => void;

const FLUSH_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;

export class SyncEngine {
  private started = false;
  private inFlight = false;
  private rerunRequested = false;
  private backoffMs = 0;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<ChangeListener>();

  start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisible);
    this.intervalTimer = setInterval(() => this.requestFlush(), FLUSH_INTERVAL_MS);

    // Drain anything left over from a previous session.
    this.requestFlush();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.intervalTimer = null;
    this.backoffTimer = null;
    this.rerunRequested = false;
    this.backoffMs = 0;
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Recover server-authoritative fields from the backend's current state. Run on startup so a
   * capture whose ack-reconcile was lost (crash between flush-commit and reconcile) is healed:
   * its server_seq/synced_at/status/pending come straight from the authoritative store.
   */
  async reconcileFromServer(): Promise<void> {
    if (typeof window === "undefined") return;
    let serverRows: ServerCapture[];
    try {
      serverRows = await getAdapter().pullState();
    } catch {
      return; // offline / transient — the per-flush path will catch up
    }
    const changed: Capture[] = [];
    for (const s of serverRows) {
      const next = await this.foldServer(s);
      if (next) changed.push(next);
    }
    this.emit(changed);
  }

  /** Ask the engine to flush soon. Coalesces concurrent requests into one in-flight run. */
  requestFlush(): void {
    if (typeof window === "undefined" || !this.started) return;
    if (this.inFlight) {
      this.rerunRequested = true;
      return;
    }
    void this.flushLoop();
  }

  private onOnline = () => {
    // Reconnected — drop any backoff and try immediately.
    this.backoffMs = 0;
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    this.requestFlush();
  };

  private onVisible = () => {
    if (document.visibilityState === "visible") this.requestFlush();
  };

  private async flushLoop(): Promise<void> {
    this.inFlight = true;
    let ok = false;
    try {
      const result = await getAdapter().flush();
      // Stopped mid-flush (e.g. logout) — do NOT reconcile, or we'd write PII back post-clear.
      if (!this.started) return;
      if (result.ok) {
        ok = true;
        this.backoffMs = 0;
        await this.reconcile(result.acks);
      } else {
        this.scheduleBackoff();
      }
    } catch {
      // Transient (offline / server error). Ops remain queued; retry with backoff.
      this.scheduleBackoff();
    } finally {
      this.inFlight = false;
      // Only chain an immediate re-flush after a SUCCESS. On failure, the backoff timer is the
      // sole re-entry point — otherwise steady capture/edit activity would hammer a down server.
      if (this.rerunRequested && ok) {
        this.rerunRequested = false;
        this.requestFlush();
      }
    }
  }

  private scheduleBackoff(): void {
    this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1_000, MAX_BACKOFF_MS);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      this.rerunRequested = false;
      this.requestFlush();
    }, this.backoffMs);
  }

  /** Fold a batch of server acks into the materialized captures (last ack per capture wins). */
  private async reconcile(acks: OpAck[]): Promise<void> {
    if (acks.length === 0) return;
    const latest = new Map<string, OpAck>();
    for (const ack of acks) latest.set(ack.client_id, ack);

    const changed: Capture[] = [];
    for (const ack of latest.values()) {
      if (!ack.server) continue; // orphan op — nothing authoritative to fold
      const next = await this.foldServer(ack.server);
      if (next) changed.push(next);
    }
    this.emit(changed);
  }

  /** Atomically merge one authoritative server row into its materialized capture. */
  private foldServer(s: ServerCapture): Promise<Capture | null> {
    return reconcileCapture(s.client_id, (local, pending) => {
      // Adopt server content/status ONLY if the server has caught up to our local op highwater.
      // If newer optimistic edits are still queued, keep them; just take the ordering fields.
      const serverCurrent = s.client_seq >= local.client_seq;
      const next: Capture = {
        ...local,
        synced_at: s.synced_at,
        server_seq: s.server_seq,
        skew_ms: s.skew_ms,
        version: Math.max(local.version, s.version),
        raw_text: serverCurrent ? s.raw_text : local.raw_text,
        status: serverCurrent ? s.status : local.status,
        audio_status: serverCurrent ? s.audio_status : local.audio_status,
        // `local` was read fresh inside the reconcile transaction — never decrease the seq.
        client_seq: local.client_seq,
        pending,
      };
      return meaningfullyChanged(local, next) ? next : null;
    });
  }

  private emit(changed: Capture[]): void {
    if (changed.length === 0) return;
    for (const listener of this.listeners) listener(changed);
  }
}

function meaningfullyChanged(a: Capture, b: Capture): boolean {
  return (
    a.synced_at !== b.synced_at ||
    a.server_seq !== b.server_seq ||
    a.skew_ms !== b.skew_ms ||
    a.version !== b.version ||
    a.raw_text !== b.raw_text ||
    a.status !== b.status ||
    a.audio_status !== b.audio_status ||
    a.pending !== b.pending
  );
}
