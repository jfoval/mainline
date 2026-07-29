# Mainline

The ultimate Getting Things Done app: **insanely easy capture** (voice/text, any device,
offline-proof) feeding an **AI-assisted but simple** system to clarify, organize, review,
and engage — built faithfully on David Allen's GTD. Web-first, open-core.

## Current status

**Live:** https://mainline.support (auto-deploys on push to `main`; the old
jfoval.github.io/mainline URL redirects here).

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

**Mobile-first pass (2026-07-28):** navigation is a bottom tab bar on phones (safe-area aware;
header = logo + sign-out only), top nav on desktop — fixes the nav-over-logo overflow on the
live site. Mic button is a 44px target and dictation errors surface as plain-language hints.
The deploy workflow forwards `NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY` from **repo secrets** (set);
without them a build falls back to the offline demo.

**GTD-domain sync (2026-07-28):** actions/projects/contexts/references now sync across devices.
Whole-row **last-write-wins** with a durable outbox (row + dirty-mark written in ONE IndexedDB
transaction — no stranded edits) and an incremental pull watermark; one `sync_gtd` RPC does
push+pull per round trip (LWW upsert, per-row fault isolation, future-clock clamp, forgery-proof
`server_seq`, FORCE RLS — migration [`0003`](supabase/migrations/0003_gtd_sync.sql)). The engine
([`src/lib/gtd/sync.ts`](src/lib/gtd/sync.ts)) mirrors the capture SyncEngine's discipline:
single-flight, backoff, online/foreground re-entry, ~20s idle pull (poor-man's realtime),
quiesce-before-logout-wipe. Default contexts got **canonical ids** so devices merge instead of
duplicating; the v3→v4 client upgrade remaps old rows + queues all pre-sync data for first push
(verified in-browser). The capture spine keeps its op-log — raw thoughts stay sacred; organize
rows are LWW replicas (rationale in 0003's header). Verify harness extended with the sync_gtd
invariants (migration 0003 applied live, plus one bug the first live run caught: 42702
alias/variable collision, fixed in `cf0e644`).

**Domain cutover + full go-live (2026-07-29) — ALL infrastructure steps are DONE:** the app is
live at **https://mainline.support** (GitHub Pages custom domain, root path, HTTPS enforced,
old URL redirects). DNS at Namecheap carries the Pages A-records + www and Resend's
DKIM/SPF/DMARC/MX. Supabase sends sign-in email via **Resend custom SMTP** from
`Mainline <hello@mainline.support>` (rate limit 30/hour, adjustable); the Magic Link template
is branded and carries both the tap-link and the **6-digit `{{ .Token }}` code** plus install
instructions — the code is how the installed (home-screen) app signs in, since iOS isolates
its storage and links open in the default browser. Auth flow is **implicit** (not PKCE) so
links sign in whichever browser opens them. Migrations
[`0004`](supabase/migrations/0004_feedback.sql) (feedback table for the in-app Help form) and
[`0005`](supabase/migrations/0005_context_archive.sql) (context archive sync) are applied.
E2E-proven in a fresh browser: domain → branded email → code-only sign-in → data hydrates.
That test caught a real gap — captures born on another device never materialized on a fresh
one (`reconcileCapture` heals-only) — fixed via `hydrateCaptureIfMissing` in `c13cf94` and
verified live. Captures hydrate on app open; the organize domain syncs continuously (~20s).

**The system is feature-complete (2026-07-29) — Slices 3–7 + the public face.** In one pass, in
this order:

- **Weekly Review** (`/review`) — guided, one screen per step: inbox to zero (with the reminder to
  empty your *other* inboxes) → every project has a mover → waiting-for → someday scan. A stalled
  project **blocks** the step (GTD's cardinal rule is a decision, not a notification); the inbox
  step counts but never blocks. Finishing writes one write-once `review_sessions` row; "last
  reviewed" goes amber at 7 days. No streaks, no confetti. Migration
  [`0006`](supabase/migrations/0006_review_sessions.sql).
- **Resurface dates** (tickler) — an optional LOCAL calendar day (`actions.resurface_on`, a `date`,
  not a timestamp) on any action or someday item. While set, the item is off every list; on the day
  it heads the **inbox** to be decided fresh. Migration
  [`0007`](supabase/migrations/0007_resurface_dates.sql).
- **Notes + promote** — one plain notes field on actions, someday items and projects; a someday
  item grows into a project (outcome + first action, notes carried, fully undoable). Migration
  [`0008`](supabase/migrations/0008_notes.sql).
- **Reference index** (`/reference`) — pointer, not vault: a line + optional link + optional project
  tie, client-side search, soft delete. Migration [`0009`](supabase/migrations/0009_reference_index.sql).
- **Horizons** (`/horizons`) — Purpose / Vision / Goals / Areas as four prose rows (one row each so
  two devices editing different horizons both keep their work; canonical ids like the default
  contexts). The **first review of each month** gains a horizons step beside the project list.
  Migration [`0010`](supabase/migrations/0010_horizons.sql).
- **Calendar handoff** — no due dates anywhere; a day-specific action gets a prefilled Google
  Calendar link or an `.ics` download ([`src/lib/calendar.ts`](src/lib/calendar.ts), pure +
  tested), then "take it off the list". No accounts, no sync, nothing to break.
- **Nav restructure** — 7 primary tabs (Capture · Inbox · Next · Projects · Waiting · Review ·
  More) with Someday / Reference / Horizons / Contexts one tap deeper on `/more`. Shared shape in
  [`src/lib/nav.ts`](src/lib/nav.ts) — a plain module, because a server page importing data from a
  `"use client"` module gets a proxy, not the array (caught by the export build).
- **The public face** — the sign-in page IS the landing page: one line, one paragraph, the sign-in
  box, and two quiet links. `/setup`, `/guide`, `/method` are **public** (`isPublicRoute`, see
  [`src/lib/public-routes.ts`](src/lib/public-routes.ts)) and the app nav is hidden from signed-out
  visitors (`NavGate`). The method guide credits *Getting Things Done* and states the
  not-affiliated line. SEO: title template + description, canonical URLs, `og.png` social card
  (`node scripts/gen-og-image.mjs`), `robots.txt` + `sitemap.xml`, and `noindex` on every private
  screen.

> **Not yet applied to production:** migrations `0006`–`0010` (paste each into the Supabase SQL
> editor, in order — each one replaces `sync_gtd` wholesale, so order matters), and the Supabase
> Magic Link email template still needs a link to `https://mainline.support/setup`. Until `0006`+
> land, the new tables/columns simply don't sync — the client keeps working locally, because
> `sync_gtd` ignores table names it doesn't know.

Health: `tsc` · `eslint` · `next build` (env-absent export) · 59 tests · live Supabase harness — all green.

## What's next — pick one

**A · Ship it. Recommended.** Apply migrations `0006`–`0010` in order, add the `/setup` link to the
Supabase Magic Link template, push to `main` (auto-deploys), then re-sign-in on each device and
walk one real weekly review. That's the "start sending it to people" moment.

**B · Onboarding polish.** Feedback tickets → email notification to the owner (Resend; edge
function or poll); tidy the 4 throwaway `johnfoval+ml-*` test users via dashboard → Users.

**C · Phase 3 — AI clarify + knowledge base.** The accelerant over the manual engine:
propose→approve seam (HostedClaude), KB by GTD horizons. Needs an Anthropic API key and the
Vercel move (server code). Contract: [`docs/AI-CLARIFY-CONTRACT.md`](docs/AI-CLARIFY-CONTRACT.md).

**D · Infra/polish.** P1.5 original-audio capture · deferred backend hardening (see
[`0002`](supabase/migrations/0002_harden_captures.sql) header) · Google one-tap sign-in ·
harness rerun (needs Auth "Confirm email" toggled OFF temporarily:
`VERIFY_EMAIL_BASE=you@gmail.com node --env-file=.env.local scripts/verify-supabase.mjs`).

> Hosting note: the custom domain serves from the ROOT (no basePath). GitHub Pages remains the
> host until Phase 3 AI needs server code — then the same domain repoints to **Vercel** with no
> user-visible change.

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
- GTD organize domain: [`src/lib/gtd/`](src/lib/gtd/) — actions/projects/contexts/references/
  review sessions/horizons store (local-first, IndexedDB `gtd-organize`, now v10); pure list +
  date logic in `views.ts` and LWW decisions in `sync-merge.ts` (both tested); background sync
  engine `sync.ts` (outbox + watermark → `sync_gtd` RPC, migrations `0003`–`0010`); UI in
  `ClarifyPanel` / `NextActionsList` / `ProjectsList` / `WaitingList` / `SomedayList` /
  `WeeklyReview` / `ReferenceIndex` / `HorizonsEditor` / `ResurfacePicker` / `CalendarHandoff`.
- Public face: `src/app/{setup,guide,method}/page.tsx` (readable signed-out via
  [`src/lib/public-routes.ts`](src/lib/public-routes.ts)); nav shape in
  [`src/lib/nav.ts`](src/lib/nav.ts); SEO metadata in `src/app/layout.tsx` +
  `robots.ts`/`sitemap.ts`; social card via `node scripts/gen-og-image.mjs`.
- Supabase client + auth: [`src/lib/supabase/`](src/lib/supabase/); gate UI `AuthGate`/`SignIn`.
  Migrations: [`supabase/migrations/`](supabase/migrations/) (applied live). Live-verify:
  [`scripts/verify-supabase.mjs`](scripts/verify-supabase.mjs).
- Theme tokens: [`src/app/globals.css`](src/app/globals.css). Brand source SVGs: `brand/`;
  app icons generated by `scripts/gen-icons.mjs` → `public/*.png`.
- Deploy: `.github/workflows/deploy.yml` (static export → GitHub Pages, env-absent = offline build).

## How to continue in a new session

Memory loads automatically and points here. Read **Current status** + **What's next** above,
pick A / B / C, and go. Working principle: **Claude builds; the user steers product decisions.**
