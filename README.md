# GTD App (working title)

The ultimate Getting Things Done app: **insanely easy capture** (voice/text, any device,
offline-proof) feeding an **AI-assisted but simple** system to clarify, organize, review,
and engage — built faithfully on David Allen's GTD. Web-first, open-core.

## Current status

Planning complete and adversarially reviewed. **Next step: scaffold Phase 1** (capture +
inbox + backend) per [`docs/PHASE-1.md`](docs/PHASE-1.md). **No code yet.**

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
Auth + Storage) · Claude API (Opus 4.8 + Haiku 4.5) · local-first append op-log capture.

## How to continue in a new session

The memory index loads automatically and points here. Read the four docs above, then start
building Phase 1 per `docs/PHASE-1.md`. Working principle: **Claude builds; the user steers
product decisions** (see memory).
