# Phase 1 — Step 5: connecting the Supabase backend

> Phase 1 steps 1–4 run fully offline on `LocalOnlyAdapter` (no backend). This is the runbook
> for turning on the real backend: cross-device sync, auth, and row-level security. **Nothing
> here is wired into the app yet** — the migration is reviewed-by-construction but not applied,
> and the `SupabaseAdapter` is written when we connect (so it can be integration-tested live).

## What's already prepared

- [`supabase/migrations/0001_phase1_captures.sql`](../supabase/migrations/0001_phase1_captures.sql)
  — `profiles` + `captures` exactly per [`DATA-MODEL.md`](DATA-MODEL.md), **FORCE RLS**
  (`user_id = auth.uid()`), indexes, auto-profile-on-signup, and `sync_capture_ops()` — an
  idempotent RPC that mirrors the verified `applyOpToServer` trust-spine logic (in-order /
  tombstone / server-clock).
- [`.env.example`](../.env.example) — the env vars the app will read.
- The swap-point: [`src/lib/capture/adapter.ts`](../src/lib/capture/adapter.ts) — today it
  returns `LocalOnlyAdapter`; step 5 makes it return a `SupabaseAdapter` when env is present.

## Path A — Hosted Supabase (recommended, ~3 min of your time)

1. Create a free project at https://supabase.com → New project. Pick a region near you.
2. **Settings → API**, copy the **Project URL** and the **anon public** key.
3. Hand those two values to Claude (or paste into `.env.local` from `.env.example`).

That's the whole hand-off. Claude then: applies the migration (SQL editor or
`supabase db push`), enables magic-link auth, writes + integration-tests the `SupabaseAdapter`
and sync route, flips `adapter.ts`, and verifies no-loss/no-dup + RLS isolation end-to-end.

## Path B — Local Supabase (fully offline dev, needs Docker)

1. Install Docker Desktop and launch it (GUI install + license acceptance — your step).
2. Claude installs the Supabase CLI, runs `supabase init` + `supabase start` (spins up local
   Postgres/Auth/Storage), applies the migration, and points the app at the local instance.

## Definition of done (unchanged from PHASE-1.md)

Sign in; capture offline; see it instantly in the inbox; edit/delete; everything syncs to
Supabase with **no loss and no duplicates** across retries/refreshes/app-kills/flaky networks;
RLS verified (a user can never see another user's captures).
