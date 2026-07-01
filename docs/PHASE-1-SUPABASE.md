# Phase 1 — Step 5: connecting the Supabase backend

> Phase 1 steps 1–4 run fully offline on `LocalOnlyAdapter` (no backend). This is the runbook
> for turning on the real backend: cross-device sync, auth, and row-level security.
>
> **Status: WIRED + verified.** The migration ([`0001`](../supabase/migrations/0001_phase1_captures.sql)
> + hardening [`0002`](../supabase/migrations/0002_harden_captures.sql)) is applied, magic-link
> auth + `SupabaseAdapter` are live behind the env gate, and the trust-spine invariants + RLS
> isolation are proven against real Postgres by [`scripts/verify-supabase.mjs`](../scripts/verify-supabase.mjs).
> The app still runs fully offline (no auth, `LocalOnlyAdapter`) whenever the env vars are absent
> — e.g. the GitHub Pages build.

## What's already prepared

- [`supabase/migrations/0001_phase1_captures.sql`](../supabase/migrations/0001_phase1_captures.sql)
  — `profiles` + `captures` exactly per [`DATA-MODEL.md`](DATA-MODEL.md), **FORCE RLS**
  (`user_id = auth.uid()`), indexes, auto-profile-on-signup, and `sync_capture_ops()` — an
  idempotent RPC that mirrors the verified `applyOpToServer` trust-spine logic (in-order /
  tombstone / server-clock, incl. server-computed `skew_ms` + implausible-clock `captured_at`
  clamp — `captured_at`/`skew_ms` are derived server-side, never trusted from the op payload).
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

## Verifying (`scripts/verify-supabase.mjs`)

Exercises the live `sync_capture_ops` RPC + RLS the way `apply.test.ts` exercises the TS reducer:
idempotent re-send (no dupes), in-order/stale-ignored, tombstone-terminal, server-computed
skew + future-clock clamp, and two-user RLS isolation.

```bash
# Needs Auth → "Confirm email" OFF (it signs in two throwaway users to prove isolation).
VERIFY_EMAIL_BASE="you@gmail.com" node --env-file=.env.local scripts/verify-supabase.mjs
```

The product uses magic-link, so the Confirm-email toggle is only for this script — flip it back
on afterward if you like.

> **Gotcha — verifying the *offline* (Pages) build locally:** `next build` also loads `.env.local`,
> so a plain local build bakes Supabase in (unlike CI, which has no `.env.local`). To reproduce the
> env-absent Pages artifact locally, unset the vars:
> `env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY pnpm build`.

## Definition of done (unchanged from PHASE-1.md)

Sign in; capture offline; see it instantly in the inbox; edit/delete; everything syncs to
Supabase with **no loss and no duplicates** across retries/refreshes/app-kills/flaky networks;
RLS verified (a user can never see another user's captures). ✅ RPC + RLS proven by the harness;
the browser end-to-end (magic-link sign-in → capture → cross-device sync) is the remaining manual
confirmation.
