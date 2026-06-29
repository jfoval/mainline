/**
 * LocalOnlyAdapter — a fully-offline SyncAdapter with NO backend.
 *
 * It runs the *real* authoritative apply logic (applyOpToServer) against a local "server"
 * object store, so the idempotency / in-sequence / tombstone contract is genuinely exercised
 * even with zero infrastructure. When Supabase arrives (step 5), only the transport changes;
 * applyOpToServer is re-implemented 1:1 by the server endpoint.
 */
import { applyOpToServer } from "./apply";
import { getDB } from "./db";
import type { FlushResult, OpAck, SyncAdapter } from "./sync-adapter";
import type { ServerCapture } from "./types";

const SERVER_SEQ_KEY = "server_seq";

export class LocalOnlyAdapter implements SyncAdapter {
  readonly name = "local-only";

  async flush(): Promise<FlushResult> {
    const db = await getDB();
    const tx = db.transaction(["oplog", "server", "meta"], "readwrite");
    const oplog = tx.objectStore("oplog");
    const server = tx.objectStore("server");
    const meta = tx.objectStore("meta");

    const seqRow = await meta.get(SERVER_SEQ_KEY);
    let seq = seqRow?.value ?? 0;
    const allocSeq = () => ++seq;

    // One server "now" per flush batch — stable, monotonic, good enough as the authoritative
    // clock for a local deployment (the local store IS the whole DB here).
    const serverNow = Date.now();
    const acks: OpAck[] = [];

    // Drain in insertion order (== per-client client_seq order, since we enqueue in order).
    let cursor = await oplog.openCursor();
    while (cursor) {
      const op = cursor.value;
      const existing = (await server.get(op.client_id)) ?? null;
      const result = applyOpToServer(existing, op, serverNow, allocSeq);
      if (result.applied && result.row) {
        await server.put(result.row);
      }
      acks.push({
        client_id: op.client_id,
        client_seq: op.client_seq,
        applied: result.applied,
        reason: result.reason,
        // Always hand back the current authoritative row (even if this op was ignored) so the
        // client can reconcile to server truth.
        server: result.row ?? existing,
      });
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await meta.put({ key: SERVER_SEQ_KEY, value: seq });
    await tx.done;
    return { ok: true, acks };
  }

  async pullState(): Promise<ServerCapture[]> {
    const db = await getDB();
    // Ascending server_seq; the UI sorts as it likes.
    return db.getAllFromIndex("server", "by_server_seq");
  }
}
