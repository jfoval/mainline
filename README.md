# Mainline

The ultimate Getting Things Done app: **insanely easy capture** (voice/text, any device,
offline-proof) feeding an **AI-assisted but simple** system to clarify, organize, review,
and engage — built faithfully on David Allen's GTD. Web-first, open-core.

## Current status

**Live:** https://jfoval.github.io/mainline/ (auto-deploys on push to `main`).

**Phase 1 is DONE (steps 1–5).** Steps 1–4: capture trust spine + inbox, offline-first against a
zero-backend `LocalOnlyAdapter` (optimistic insert, durable IndexedDB op-log,
idempotent/in-sequence/tombstone apply, background sync engine, capture UI text + voice,
inbox edit/delete). **Step 5: real backend live** — Supabase (Postgres + Auth), magic-link
sign-in, and a `SupabaseAdapter` behind the env gate, with a `sync_capture_ops` RPC that mirrors
`applyOpToServer` 1:1 under FORCE RLS. The trust-spine invariants + RLS isolation are proven
against real Postgres by [`scripts/verify-supabase.mjs`](scripts/verify-supabase.mjs); the code
was adversarially reviewed twice (12 + 14 findings). The app still runs fully offline (no auth,
`LocalOnlyAdapter`) whenever env is absent — e.g. the GitHub Pages build. Branded **Mainline**;
themed **"System Azure on Black"** (tokens in [`src/app/globals.css`](src/app/globals.css)).

**Phase 2 (manual GTD engine) — Slice 1 is DONE:** the hand-driven core loop, AI-off by design
(FOUNDATIONS §10 was resequenced: the manual engine now comes *before* AI). Clarify an inbox item
— *actionable?* → verb-first **next action** with a context (2-min rule flagged), or → **Someday /
Reference / Trash** — and the capture leaves the inbox via the synced op-log. New views: **Next**
(actions grouped by context, check-off) and **Someday** (reactivate anytime). Local-first
(`src/lib/gtd/`, IndexedDB) with the capture store's disciplines: durable-before-publish,
generation-guarded logout wipes, cross-tab BroadcastChannel, idempotent clarify (one action per
source capture). Adversarially reviewed (17 confirmed findings fixed); all flows verified
in-browser including the v1→v2 IndexedDB upgrade.

**Slice 2 is DONE — Projects + Waiting-For:** clarify's "actionable" step now forks three ways —
next action, **Project** (outcome + its first next action created together, so no project is ever
born stalled), or **Waiting For** (delegated/blocked, with who-it's-on + aging). New views:
**Projects** (each card shows its current mover; a stalled project surfaces GTD's cardinal-rule
re-decision inline — name the next action or mark it complete, derived live so it can't go stale)
and **Waiting** (oldest first; resolve as done or "my move now" → Next). Next-action rows show
their project. IndexedDB v2→v3 (projects store + waiting-field backfill). Verified end-to-end
in-browser (project clarify → stall → re-action; waiting → resolve), zero console errors.

Health: `tsc` · `eslint` · `next build` (env-absent export) · 25 tests · live Supabase harness — all green.

> Remaining step-5 confirmation: the browser end-to-end (magic-link sign-in → capture → cross-device
> sync) — the RPC/RLS contract underneath it is already proven. See [`docs/PHASE-1-SUPABASE.md`](docs/PHASE-1-SUPABASE.md).

## What's next — pick one

**A · Manual GTD engine, Slice 3 — the guided Weekly Review. Recommended.** The keystone habit
(FOUNDATIONS §2): a step-by-step flow — empty the inbox, review projects for stalls, age the
Waiting-For list, re-decide stale Someday items. This completes the whole manual loop. Review
queries are already sketched in [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) §review.

**B · Phase 3 — AI clarify + knowledge base.** The accelerant over the manual engine:
propose→approve seam (HostedClaude), KB by GTD horizons. Needs an Anthropic API key.
Contract: [`docs/AI-CLARIFY-CONTRACT.md`](docs/AI-CLARIFY-CONTRACT.md).

**C · Infra/polish.** Move to Vercel (server code + drops the basePath juggling) · gtd-domain
backend sync (mirror the capture spine's Supabase path) · P1.5 original-audio capture · full PWA
icon set · deferred backend hardening (see [`0002`](supabase/migrations/0002_harden_captures.sql) header).

> Hosting note: on GitHub Pages the app lives under `/mainline/`, so assets are
> basePath-prefixed via `NEXT_PUBLIC_BASE_PATH`. That juggling disappears on a root host like
> **Vercel** — worth moving once the backend/AI land (they need server code Pages can't run).

### Run it

```bash
pnpm install
pnpm dev     # http://localhost:3000 — with .env.local present: magic-link auth + Supabase sync;
             # without it: fully offline (no sign-in), like the public demo
pnpm test    # trust-spine invariant tests
# PWA install / full offline-load needs a production build:
pnpm build && pnpm start
# Reproduce the deployed offline build locally (next build also reads .env.local):
env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY pnpm build
```

## Docs — read in this order

1. [`docs/FOUNDATIONS.md`](docs/FOUNDATIONS.md) — **source of truth**: vision, GTD
   principles, strategy/tiers, architecture, the AI seam, calendar design, build roadmap.
2. [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — Postgres schema (v0.2, 5-lens reviewed).
3. [`docs/AI-CLARIFY-CONTRACT.md`](docs/AI-CLARIFY-CONTRACT.md) — the AI propose→approve
   input/output contract (v0.2).
4. [`docs/PHASE-1.md`](docs/PHASE-1.md) — the first build (**complete**, all 5 steps).
5. [`docs/PHASE-1-SUPABASE.md`](docs/PHASE-1-SUPABASE.md) — the backend runbook + live-verification
   harness docs (how to re-run `scripts/verify-supabase.mjs`, offline-build gotcha).

## Stack (decided)

Web-first TypeScript · Next.js (App Router) + React + Tailwind v4 · PWA · Supabase (Postgres +
Auth + Storage) · Claude API (Opus 4.8 + Haiku 4.5) · local-first, sequenced op-log capture.

## Code map

- Capture trust spine: [`src/lib/capture/`](src/lib/capture/) — backend swap-point `adapter.ts`
  (env present → `SupabaseAdapter`, absent → offline `LocalOnlyAdapter`).
- GTD organize domain: [`src/lib/gtd/`](src/lib/gtd/) — actions/projects/contexts/references
  store (local-first, IndexedDB `gtd-organize`); pure list logic in `views.ts` (tested); UI in
  `ClarifyPanel` / `NextActionsList` / `ProjectsList` / `WaitingList` / `SomedayList`.
- Supabase client + auth: [`src/lib/supabase/`](src/lib/supabase/); gate UI `AuthGate`/`SignIn`.
  Migrations: [`supabase/migrations/`](supabase/migrations/) (applied live). Live-verify:
  [`scripts/verify-supabase.mjs`](scripts/verify-supabase.mjs).
- Theme tokens: [`src/app/globals.css`](src/app/globals.css). Brand source SVGs: `brand/`;
  app icons generated by `scripts/gen-icons.mjs` → `public/*.png`.
- Deploy: `.github/workflows/deploy.yml` (static export → GitHub Pages, env-absent = offline build).

## How to continue in a new session

Memory loads automatically and points here. Read **Current status** + **What's next** above,
pick A / B / C, and go. Working principle: **Claude builds; the user steers product decisions.**
