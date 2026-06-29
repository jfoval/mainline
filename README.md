# GTD App (working title)

The ultimate Getting Things Done app: **insanely easy capture** (voice/text, any device,
offline-proof) feeding an **AI-assisted but simple** system to clarify, organize, review,
and engage — built faithfully on David Allen's GTD. Web-first, open-core.

## Current status

**Phase 1 in progress — steps 1–4 built (capture trust spine + inbox).** Offline-first
capture works end-to-end against a `LocalOnlyAdapter` (zero backend): optimistic insert,
durable IndexedDB op-log, idempotent/in-sequence/tombstone apply, background sync engine.
**Step 5 (Supabase backend) is deferred** until Docker/the Supabase CLI is available locally
(or a hosted project is wired in) — [`docs/PHASE-1.md`](docs/PHASE-1.md) plans for exactly
this: steps 1–4 are not blocked by backend setup.

### Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000  (capture + inbox, fully local)
# PWA install / full offline-load needs a production build:
pnpm build && pnpm start
```

Trust-spine code lives in [`src/lib/capture/`](src/lib/capture/); the single backend
swap-point is [`src/lib/capture/adapter.ts`](src/lib/capture/adapter.ts).

## Docs — read in this order

1. [`docs/FOUNDATIONS.md`](docs/FOUNDATIONS.md) — **source of truth**: vision, GTD
   principles, strategy/tiers, architecture, the AI seam, calendar design, build roadmap.
2. [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — Postgres schema (v0.2, 5-lens reviewed).
3. [`docs/AI-CLARIFY-CONTRACT.md`](docs/AI-CLARIFY-CONTRACT.md) — the AI propose→approve
   input/output contract (v0.2).
4. [`docs/PHASE-1.md`](docs/PHASE-1.md) — the concrete first build: stack, ordered steps,
   definition of done.

## Stack (decided)

Web-first TypeScript · Next.js (App Router) + React + Tailwind · PWA · Supabase (Postgres +
Auth + Storage) · Claude API (Opus 4.8 + Haiku 4.5) · local-first, sequenced op-log capture.

## How to continue in a new session

The memory index loads automatically and points here. Read the four docs above, then start
building Phase 1 per `docs/PHASE-1.md`. Working principle: **Claude builds; the user steers
product decisions** (see memory).
