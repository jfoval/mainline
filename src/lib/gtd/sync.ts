"use client";

/**
 * GtdSync — background push/pull for the organize domain, mirroring the capture SyncEngine's
 * discipline (single-flight, exponential backoff, online/visible/interval re-entry, quiesce on
 * logout) over a simpler transport: whole-row last-write-wins upserts plus an incremental pull
 * watermark, via ONE `sync_gtd` RPC per round trip.
 *
 * Why not the capture op-log here: organize rows are single-user structured state where "newest
 * edit of the row wins" is the correct merge, so per-row LWW + a durable outbox gives the same
 * no-loss guarantee (rows are dirty-marked in the SAME IndexedDB transaction as the write) with
 * far less machinery. The capture spine keeps its op-log — raw thoughts stay sacred.
 *
 * NO-LOSS reasoning for the flush path:
 *   1. Outbox entries persist until the RPC returns success; failures leave the queue intact.
 *   2. The RPC upsert is idempotent (equal LWW clock → skip), so a crash after server-apply but
 *      before outbox-clear just re-sends rows the server ignores.
 *   3. Clearing skips any row edited mid-flight (updated_at moved) — it rides the next flush.
 *   4. The watermark advances only AFTER pulled rows are durably applied; a crash in between
 *      re-pulls the same rows, and LWW re-application is a no-op.
 */
import { getSupabase, isSupabaseEnabled } from "@/lib/supabase/client";
import {
  applyServerChanges,
  clearOutboxIfUnchanged,
  getMeta,
  readOutbox,
  setMeta,
  type GtdChange,
} from "./db";

const FLUSH_INTERVAL_MS = 20_000;
const MAX_BACKOFF_MS = 30_000;
const WATERMARK_KEY = "gtd_last_seq";

/** What the engine needs from the store, injected to avoid a store↔engine import cycle. */
interface Delegate {
  /** Fold adopted server rows into the in-memory view (generation-guarded by the store). */
  onAdopted: (changes: GtdChange[]) => void;
}

interface SyncGtdResult {
  rows?: Array<{ table: GtdChange["table"]; row: GtdChange["row"] }>;
  max_seq?: number | string;
}

class GtdSync {
  private started = false;
  private inFlight = false;
  private rerunRequested = false;
  private backoffMs = 0;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private delegate: Delegate | null = null;

  setDelegate(delegate: Delegate): void {
    this.delegate = delegate;
  }

  start(): void {
    if (this.started || typeof window === "undefined" || !isSupabaseEnabled()) return;
    this.started = true;
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisible);
    this.intervalTimer = setInterval(() => this.requestFlush(), FLUSH_INTERVAL_MS);
    // Startup round trip: pushes anything left over, pulls what other devices did.
    this.requestFlush();
  }

  /** Quiesce (logout/account-switch). In-flight work re-checks `started` after every await and
   *  aborts before touching local state, so nothing lands post-wipe. */
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

  /** Ask for a flush soon. Coalesces concurrent requests into one in-flight run. */
  requestFlush(): void {
    if (typeof window === "undefined" || !this.started) return;
    if (this.inFlight) {
      this.rerunRequested = true;
      return;
    }
    void this.flushLoop();
  }

  private onOnline = () => {
    this.backoffMs = 0;
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    this.requestFlush();
  };

  private onVisible = () => {
    // Foregrounding the app is the natural "show me what my other device did" moment.
    if (document.visibilityState === "visible") this.requestFlush();
  };

  private async flushLoop(): Promise<void> {
    this.inFlight = true;
    let ok = false;
    try {
      const { changes, stamps } = await readOutbox();
      if (!this.started) return;
      const since = (await getMeta<number>(WATERMARK_KEY)) ?? 0;
      if (!this.started) return;

      const { data, error } = await getSupabase().rpc("sync_gtd", {
        p_changes: changes.map((c) => ({ table: c.table, row: c.row })),
        p_since: since,
      });
      if (!this.started) return;
      if (error) {
        this.scheduleBackoff();
        return;
      }

      // Push acknowledged — clear exactly what we sent (unless edited mid-flight).
      await clearOutboxIfUnchanged(stamps);
      if (!this.started) return;

      // Fold the pulled rows durably first, THEN advance the watermark (crash between the two
      // re-pulls the same rows; LWW makes re-application a no-op).
      const result = (data ?? {}) as SyncGtdResult;
      const pulled: GtdChange[] = (result.rows ?? []) as GtdChange[];
      const adopted = await applyServerChanges(pulled);
      if (!this.started) return;
      if (adopted.length > 0) this.delegate?.onAdopted(adopted);
      const maxSeq = Number(result.max_seq ?? since);
      if (maxSeq > since) await setMeta(WATERMARK_KEY, maxSeq);

      ok = true;
      this.backoffMs = 0;
    } catch {
      this.scheduleBackoff();
    } finally {
      this.inFlight = false;
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
}

export const gtdSync = new GtdSync();
