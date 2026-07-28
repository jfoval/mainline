/**
 * Live verification for the Phase 1 Supabase backend (docs/PHASE-1-SUPABASE.md "Definition of
 * done"). Proves, against the REAL project, that:
 *   • sync_capture_ops mirrors applyOpToServer: idempotent + in-order, tombstone terminal,
 *     server-computed skew + implausible-clock clamp;
 *   • re-sending an identical batch produces NO duplicates and NO changes (crash-safety);
 *   • RLS isolates users: B cannot see or mutate A's captures.
 *
 * Run:  node --env-file=.env.local scripts/verify-supabase.mjs
 *
 * Requires two test sign-ins. It uses email+password signup, which returns a session ONLY when
 * Auth → "Confirm email" is OFF (Dashboard → Authentication → Sign In / Providers → Email). The
 * product itself uses magic-link; this toggle is purely for automated verification.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY not set. Create .env.local first.");
  process.exit(2);
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function newClient() {
  // persistSession:false → each client is an independent, in-memory session (two users, one proc).
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Supabase Auth rejects example.com etc. as invalid. Derive throwaway addresses from a real
// domain via plus-aliasing (no mail is sent — Confirm email is off for the run). Override the
// base with VERIFY_EMAIL_BASE=you@domain; falls back to a gmail alias.
const EMAIL_BASE = process.env.VERIFY_EMAIL_BASE || "mainline.verify@gmail.com";
function testEmail(label) {
  const [local, domain] = EMAIL_BASE.split("@");
  return `${local}+ml-${label}-${Date.now()}@${domain}`;
}

async function signUpTestUser(label) {
  const client = newClient();
  const email = testEmail(label);
  const password = `Pw-${label}-${Date.now()}-x!`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`signUp(${label}) failed: ${error.message}`);
  if (!data.session) {
    throw new Error(
      "signUp returned no session — disable Auth → 'Confirm email' for the verification run, then retry.",
    );
  }
  return { client, email, id: data.user.id };
}

const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();

async function main() {
  console.log("→ Signing in two independent test users…");
  const A = await signUpTestUser("a");
  const B = await signUpTestUser("b");
  check("two distinct users", A.id !== B.id);

  // Unique client_ids per run so reruns don't collide with prior rows.
  const run = Date.now().toString(36);
  const c1 = crypto.randomUUID();
  const c2 = crypto.randomUUID();
  const cSkew = crypto.randomUUID();

  // ── Batch 1 (as A): create+edit c1, create+delete c2, a future-clock create, and two ops
  //    that MUST be ignored (a stale re-edit and a post-tombstone status change). ──
  const batch = [
    { client_id: c1, client_seq: 1, kind: "create", raw_text: "hello", source: "web", captured_at: iso(0) },
    { client_id: c1, client_seq: 2, kind: "edit", raw_text: "hello world" },
    { client_id: c2, client_seq: 1, kind: "create", raw_text: "temp", source: "web", captured_at: iso(0) },
    { client_id: c2, client_seq: 2, kind: "delete" },
    { client_id: c1, client_seq: 2, kind: "edit", raw_text: "STALE - must be ignored" }, // stale seq
    { client_id: c2, client_seq: 3, kind: "set_status", status: "inbox" }, // resurrect tombstone → ignored
    { client_id: cSkew, client_seq: 1, kind: "create", raw_text: "future", source: "web", captured_at: iso(10 * 60 * 1000) },
  ];

  console.log(`→ [A] sync_capture_ops (batch of ${batch.length}), run ${run}…`);
  const r1 = await A.client.rpc("sync_capture_ops", { p_ops: batch });
  check("RPC succeeded", !r1.error, r1.error?.message);
  const rows1 = new Map((r1.data ?? []).map((r) => [r.client_id, r]));

  const row1 = rows1.get(c1);
  check("c1 applied in-order (raw_text = 'hello world')", row1?.raw_text === "hello world", row1?.raw_text);
  check("c1 stale edit ignored (version = 2)", row1?.version === 2, `version=${row1?.version}`);
  check("c1 status inbox", row1?.status === "inbox", row1?.status);

  const row2 = rows1.get(c2);
  check("c2 tombstoned (status = discarded)", row2?.status === "discarded", row2?.status);

  const rowS = rows1.get(cSkew);
  check("future-clock skew recorded (> 5min)", (rowS?.skew_ms ?? 0) > 300000, `skew_ms=${rowS?.skew_ms}`);
  check(
    "future-clock captured_at clamped to server clock",
    rowS && Math.abs(new Date(rowS.captured_at) - new Date(rowS.synced_at)) < 5000,
    rowS && `captured_at=${rowS.captured_at} synced_at=${rowS.synced_at}`,
  );

  // ── Idempotency: re-send the identical batch. No new rows, no state change. ──
  console.log("→ [A] re-sending identical batch (idempotency / crash-safety)…");
  const r2 = await A.client.rpc("sync_capture_ops", { p_ops: batch });
  check("re-send RPC succeeded", !r2.error, r2.error?.message);
  const reRow1 = (r2.data ?? []).find((r) => r.client_id === c1);
  check("re-send did not bump c1 version (still 2)", reRow1?.version === 2, `version=${reRow1?.version}`);

  const aAll = await A.client.from("captures").select("*");
  check("A sees exactly its 3 captures", (aAll.data?.length ?? 0) === 3, `count=${aAll.data?.length}`);
  const aClientIds = new Set((aAll.data ?? []).map((r) => r.client_id));
  check("A's captures are c1,c2,cSkew (no dupes)", aClientIds.size === 3 && aClientIds.has(c1) && aClientIds.has(c2) && aClientIds.has(cSkew));

  // ── RLS: B is fully isolated from A. ──
  console.log("→ [B] verifying row-level isolation…");
  const bSees = await B.client.from("captures").select("*");
  check("B cannot see any of A's captures", (bSees.data?.length ?? 0) === 0, `B sees ${bSees.data?.length}`);

  // B tries to touch A's client_id — RLS scopes to B, so this makes B's OWN row, never A's.
  await B.client.rpc("sync_capture_ops", {
    p_ops: [{ client_id: c1, client_seq: 5, kind: "edit", raw_text: "B TAMPER" }],
  });
  const aAfter = await A.client.from("captures").select("*").eq("client_id", c1).single();
  check("A's c1 untouched by B's write attempt", aAfter.data?.raw_text === "hello world", aAfter.data?.raw_text);

  // ═══════════════ Phase 2: sync_gtd (organize-domain LWW sync, migration 0003) ═══════════════
  console.log("→ [A] sync_gtd: LWW upsert + incremental pull…");
  const ctxId = "6fb2a1c0-0000-4000-8000-000000000002"; // canonical @computer id (types.ts)
  const projId = crypto.randomUUID();
  const actId = crypto.randomUUID();
  const t0 = iso(-60_000);
  const t1 = iso(-30_000);
  const t2 = iso(-10_000);

  const actionRow = {
    id: actId, title: "fresh title", context_id: ctxId, project_id: projId, status: "active",
    is_two_minute: false, energy: null, waiting_on_text: null, waiting_since: null,
    source_capture_id: null, created_at: t1, updated_at: t1, sort_order: 2,
  };
  const push1 = [
    { table: "contexts", row: { id: ctxId, name: "@computer", type: "tool", sort_order: 1, updated_at: t1 } },
    { table: "projects", row: { id: projId, title: "Verify project", status: "active", source_capture_id: null, created_at: t1, updated_at: t1, sort_order: 1 } },
    { table: "actions", row: actionRow },
  ];
  const g1 = await A.client.rpc("sync_gtd", { p_changes: push1, p_since: 0 });
  check("sync_gtd push succeeded", !g1.error, g1.error?.message);
  check("pull since 0 returns the 3 pushed rows", (g1.data?.rows ?? []).length === 3, `rows=${g1.data?.rows?.length}`);
  const seq1 = Number(g1.data?.max_seq ?? 0);
  check("max_seq advanced", seq1 > 0, `max_seq=${seq1}`);

  console.log("→ [A] idempotent re-push / stale-loses / newer-wins…");
  const g2 = await A.client.rpc("sync_gtd", { p_changes: push1, p_since: seq1 });
  check(
    "identical re-push: no changes, watermark stable (equal LWW clock skips)",
    !g2.error && (g2.data?.rows ?? []).length === 0 && Number(g2.data?.max_seq) === seq1,
    g2.error?.message ?? `rows=${g2.data?.rows?.length} max=${g2.data?.max_seq}`,
  );

  const g3 = await A.client.rpc("sync_gtd", {
    p_changes: [{ table: "actions", row: { ...actionRow, title: "STALE - must lose", updated_at: t0 } }],
    p_since: seq1,
  });
  check("stale push (older clock) ignored", !g3.error && (g3.data?.rows ?? []).length === 0, g3.error?.message);

  const g4 = await A.client.rpc("sync_gtd", {
    p_changes: [{ table: "actions", row: { ...actionRow, title: "fresher title", updated_at: t2 } }],
    p_since: seq1,
  });
  const pulled4 = (g4.data?.rows ?? []).filter((c) => c.table === "actions");
  check(
    "newer push applied + returned by incremental pull",
    pulled4.length === 1 && pulled4[0].row.title === "fresher title",
    JSON.stringify(pulled4.map((c) => c.row.title)),
  );

  const g5 = await A.client.rpc("sync_gtd", {
    p_changes: [{ table: "projects", row: { id: projId, title: "clock abuser", status: "active", source_capture_id: null, created_at: t1, updated_at: iso(500 * 24 * 3600 * 1000), sort_order: 1 } }],
    p_since: 0,
  });
  const proj5 = (g5.data?.rows ?? []).find((c) => c.table === "projects" && c.row.id === projId);
  check(
    "implausibly-future updated_at clamped (≤ now + 6 min)",
    proj5 && Date.parse(proj5.row.updated_at) < Date.now() + 6 * 60_000,
    proj5?.row?.updated_at,
  );

  const gBad = await A.client.rpc("sync_gtd", {
    p_changes: [
      { table: "actions", row: { id: "not-a-uuid", updated_at: t2 } },
      { table: "reference_items", row: { id: crypto.randomUUID(), title: "kept", body: null, source_capture_id: null, created_at: t2, updated_at: t2 } },
    ],
    p_since: 0,
  });
  check(
    "malformed row skipped; good row in same batch still applied",
    !gBad.error && (gBad.data?.rows ?? []).some((c) => c.table === "reference_items" && c.row.title === "kept"),
    gBad.error?.message,
  );

  console.log("→ [B] sync_gtd isolation…");
  const gB0 = await B.client.rpc("sync_gtd", { p_changes: [], p_since: 0 });
  check(
    "B pulls none of A's gtd rows",
    !gB0.error && (gB0.data?.rows ?? []).length === 0,
    gB0.error?.message ?? `rows=${gB0.data?.rows?.length}`,
  );
  await B.client.rpc("sync_gtd", {
    p_changes: [{ table: "actions", row: { ...actionRow, title: "B TAMPER", updated_at: iso(0) } }],
    p_since: 0,
  });
  const gA = await A.client.rpc("sync_gtd", { p_changes: [], p_since: 0 });
  const aAct = (gA.data?.rows ?? []).find((c) => c.table === "actions" && c.row.id === actId);
  check("A's action untouched by B pushing A's id (B made its OWN row)", aAct?.row?.title === "fresher title", aAct?.row?.title);

  console.log("");
  if (failures === 0) {
    console.log("✅ ALL CHECKS PASSED — capture spine: no loss/dupes, tombstone terminal, skew clamped; gtd sync: LWW faithful, idempotent, clock-clamped, fault-isolated; RLS isolates both domains.");
    process.exit(0);
  } else {
    console.error(`❌ ${failures} check(s) FAILED.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("✗ Verification crashed:", e.message);
  process.exit(1);
});
