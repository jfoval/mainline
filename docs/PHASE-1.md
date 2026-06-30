# Phase 1 — Capture + Inbox + Backend (build plan)

> **STATUS (2026-06-30):** Steps 1–4 ✅ **done** — built, adversarially reviewed (12 bugs
> fixed), Vitest-tested, branded, themed, and deployed live on a `LocalOnlyAdapter` (no
> backend). **Step 5 (Supabase) is the next build step:** the migration + FORCE RLS +
> idempotent sync RPC are drafted in [`../supabase/migrations/0001_phase1_captures.sql`](../supabase/migrations/0001_phase1_captures.sql);
> follow [`PHASE-1-SUPABASE.md`](PHASE-1-SUPABASE.md) to connect a project.

> The first thing to build. Goal: a **bulletproof capture trust spine** — idea → captured
> in <2s, voice or text, fully offline, never lost or duplicated — plus an inbox and a
> syncing backend. **No AI yet** (that's Phase 2). Read [`FOUNDATIONS.md`](FOUNDATIONS.md),
> [`DATA-MODEL.md`](DATA-MODEL.md) (esp. §"trust spine" + `profiles`/`captures`), and this
> file before scaffolding.

## Stack (decided — see FOUNDATIONS §6)
- **Next.js (App Router) + TypeScript + Tailwind**, PWA-enabled (manifest + service worker).
- **Supabase** (Postgres + Auth + Storage). Dev default: **local Supabase via the Supabase
  CLI** (no account needed). If Docker/CLI isn't available, fall back to a lightweight local
  API behind the same `SyncAdapter` interface and swap Supabase in later — steps 1–4 are not
  blocked by backend setup.
- Package manager: **pnpm**. Env in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, anon key,
  service-role key server-side only).

## Build order (do in this sequence)
1. **Skeleton** — `git init`; Next.js + TS + Tailwind; PWA manifest + service worker; basic
   app shell. Installable on phone + desktop.
2. **Capture trust spine FIRST** (the riskiest, most important part):
   - An **IndexedDB op-log queue**: ops `create | edit | set_status | delete`, each stamped
     with a per-row `client_seq`; rows keyed by a device-generated `client_id` (uuid).
   - A **`SyncAdapter` interface** (`enqueue(op)`, `pullState()`, `flush()`) with two impls:
     `LocalOnlyAdapter` (works with zero backend) and `SupabaseAdapter` (step 5). The app
     codes against the interface so local-first works immediately.
   - **Background sync** with retry; **optimistic** local insert (UI never waits on network).
3. **Capture UI** — one-tap **text + voice** (Web Speech API for instant transcription),
   instant optimistic insert, works offline. This is the 2-second promise; make it feel
   instant. (Storing the original **audio** is optional in Phase 1 — transcript is required;
   wire the two-phase content-addressed audio upload from DATA-MODEL §trust-spine as a P1.5
   follow-up.)
4. **Inbox view** — list captures (ordered by server `synced_at`, not device clock), show
   status, allow **edit** and **delete** (this exercises the op-log edit/delete + tombstone
   path end-to-end).
5. **Supabase backend** — migration for **`profiles` + `captures`** exactly per DATA-MODEL
   (incl. `client_id`, `client_seq`, `audio_status`, `synced_at`, `skew_ms`, `status`,
   `version`); `user_id` + **FORCE RLS** (`user_id = auth.uid()`) from day one; Supabase
   **Auth** (magic link) to establish `user_id`; the **idempotent sync endpoint** that
   **upserts on `(user_id, client_id)`** and **applies ops in `client_seq` order, ignoring
   any op with `client_seq` ≤ the row's current sequence** (late stale op can't resurrect a
   discarded capture). Point `SyncAdapter` at `SupabaseAdapter`.

> Phase 1 migration creates only `profiles` + `captures`. Later phases add tables
> incrementally (projects/actions/areas in Phase 3, etc.). Don't pre-build them.

## Definition of done
On phone **and** desktop browser, a user can: sign in; capture by voice or text **offline**;
see it appear instantly in the inbox; edit and delete it; and have everything sync to
Supabase **with no loss and no duplicates** across retries, refreshes, app-kills, and
flaky/offline networks. RLS verified (a user can never see another user's captures).

## Explicitly out of scope for Phase 1
AI clarify (Phase 2) · projects/actions/areas/contexts (Phase 3) · calendar · weekly review ·
knowledge-base onboarding · native/watch apps · billing.

## Carry-forward gotchas from the spec review (don't re-learn the hard way)
- Order/age by **server** `synced_at` (or a server sequence), never the device `captured_at`
  (clock skew). Record `skew_ms`.
- "Append-only" was **wrong** — captures are mutable (status/edit/delete). The op-log +
  tombstones + `client_seq` idempotency is the correct model.
- Clearing local stores on **logout/account-switch** is required (shared-device PII).
- Block clarify (Phase 2) on a capture whose `raw_text` is empty AND `audio_status != stored`.
