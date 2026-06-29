# GTD App — Foundations

> The single source of truth for what we're building and why. Everything here is a
> decision we've made together. Update this doc when a decision changes.

---

## 1. Vision & thesis

Build the ultimate Getting Things Done (GTD) app. Two bets:

1. **Capture is insanely easy** — idea → captured in under 2 seconds, from any device
   (phone, PC, watch), by voice or text, even with no signal. Nothing ever lost.
2. **The processing system is solid but as simple as possible** — an AI-assisted brain
   that helps you clarify, organize, review, and engage, removing ~90% of the tedium
   while keeping you in control.

Reach goal: works on **any phone and any PC** so **anyone** can use the system well.

---

## 2. GTD foundations we honor

GTD's premise: *your mind is for having ideas, not holding them.* Open loops drain
mental bandwidth and erode calm. The system works only if your brain **trusts** it is
complete and current. Break that trust and the user quits. Every design choice below
protects trust.

The 5 stages (our app is organized around these):

1. **Capture** — collect 100% of what has your attention into an inbox. Structureless
   on purpose; capture and clarify are *separate* stages.
2. **Clarify** — for each item: actionable? If no → trash / someday-maybe / reference.
   If yes → next physical action; <2 min do now; else delegate (waiting-for) or defer
   (calendar / next actions). >1 action to the outcome → it's a **Project**.
3. **Organize** — Projects, Next Actions by **context**, Waiting-For, Calendar (hard
   landscape *only*), Someday/Maybe, Reference, Tickler.
4. **Reflect** — the **Weekly Review** is the keystone habit. We *enforce* it as a
   guided flow (most-skipped, most-important GTD practice).
5. **Engage** — choose actions by context, time, energy, priority.

Concepts we treat as first-class (most apps ignore the last two):

- **Next-action discipline** — "Mom" is not an action; "Call Mom re: Thanksgiving" is.
- **2-minute rule**, **Projects = >1 action**, **Contexts as filters**.
- **Horizons of Focus** (altitude model): Runway (actions) · 10k (projects) ·
  20k (areas of focus/responsibility) · 30k (1–2yr goals) · 40k (3–5yr vision) ·
  50k (purpose/principles). **These ARE the AI knowledge base (see §5).**
- **Natural Planning Model** for projects: Purpose → Vision → Brainstorm → Organize →
  Next action.

---

## 3. Product strategy & business model

Goal: **wide adoption fast**, cheap, with a genuinely free option.

Key realization: **AI is an accelerant, not the core.** The whole GTD app is fully
functional with AI turned off (that's just classic manual GTD). Only two things can't
be simultaneously free + private + zero-infra:

1. High-quality **cloud AI** (Opus-grade clarify)
2. **Cross-device sync** (needs a server)

So both become **optional managed conveniences**; the core stays independent of both.

### Tiers (open-core + usage-priced AI)

- **Free forever** — full GTD app; manual clarify, bring-your-own-key, or local model.
  Fully private if self-hosted. Zero marginal cost to us → fuels adoption.
- **Cheap paid** — we host it + sync devices + we handle Opus/Haiku AI at
  **pass-through cost + slight markup**. The convenience funnel.
- **Self-host / open-core** — the fully-free, fully-local, fully-private deployment.
  Likely open-source the core so the privacy claim is *provable*.

Privacy posture: honest answer at every tier. Hosted AI uses Anthropic API (no training
on data). Privacy-maximal users run local/self-host.

---

## 4. Core design principles (do not violate)

1. **The app is fully functional with AI = OFF.** AI never gates core GTD value.
2. **AI lives behind one pluggable "Clarify provider" seam** (see §6). Build the seam
   on day one; implement only hosted Claude first.
3. **Capture never fails.** Local-first, append-only, offline-proof (see §6).
4. **Human-in-the-loop clarify.** AI proposes; user one-tap approves/corrects. This is
   what preserves GTD "trust."
5. **One consistent interaction = propose → approve/correct** (used for clarify AND for
   growing the knowledge base).
6. **Don't over-engineer.** YAGNI. No vector DB, no CRDT engine, no native apps until
   they earn their keep. Over-engineering is the classic GTD-app killer.

---

## 5. The knowledge base = GTD's upper Horizons

The AI's context about *you*, structured by horizon (not an arbitrary form):

- **Layer 1 — Profile & logistics:** roles/hats, key people (name + relationship),
  contexts that exist in *your* life, working rhythm & energy patterns.
- **Layer 2 — Areas of Focus (20k):** Health, Finances, Family, each work function,
  Home, Growth. *The single most valuable AI context* — lets AI file a capture under
  the right area/project.
- **Layer 3 — Goals / Vision / Purpose (30–50k):** lighter touch; drives priority hints
  and someday/maybe.

How it stays alive without overcomplicating:
- Seeded by a **short onboarding conversation** (the AI can conduct it by voice).
- **Grows by the AI proposing additions** from your captures ("I keep seeing 'Sarah' —
  report or client?"); you approve. Same propose→approve pattern as clarify.
- Always editable, organized by horizon, never a junk drawer.

---

## 6. Architecture & stack

**Web-first, TypeScript end to end** — one codebase reaches any PC, Mac, and phone, and
is the fastest to build. Reaching "anyone can use it" requires web.

- **Brain + clients:** Next.js / React (TypeScript). Runs in any browser; installs as a
  **PWA** on any phone for on-the-go capture *and* processing.
- **Backend:** Next.js server + **Postgres via Supabase** (auth, DB, audio storage,
  realtime sync, portable — we own the data).
- **AI:** Claude API server-side — **Opus 4.8** (`claude-opus-4-8`) for heavy clarify
  reasoning, **Haiku 4.5** (`claude-haiku-4-5-20251001`) for cheap classification.
- **Voice:** browser Web Speech API for instant free transcription where supported;
  server-side Whisper-class fallback for reliability + to keep original audio.
- **Later (not now):** Capacitor / Expo shell + Apple Watch app; native Siri Shortcuts.

### Capture reliability (protects the whole thesis)

Captures write to the **device locally first** (instant, fully offline), then sync in the
background. The device holds an **ordered, sequenced op-log per capture**
(create/edit/set-status/delete), keyed by a client-generated UUID; the server applies ops
**idempotently and in sequence** (a late stale op can't resurrect a deleted capture, and
audio uploads via a two-phase content-addressed handshake so a capture's real content is
never lost). This is deliberately **not** a CRDT: ops are simple and mostly single-device,
so an op-log + retry is bulletproof without heavyweight merge machinery. Heavier editing
(organizing/processing) is server-authoritative with a `version`-based optimistic-
concurrency contract (a defined conflict UX, not "no conflicts"). The same local store
*is* the whole DB in a fully-local deployment. (Full detail: `DATA-MODEL.md` §trust spine.)

---

## 7. Data model (sketch — to be finalized before scaffolding)

- **Capture** — raw inbox item: text, optional audio, source device, timestamp,
  status (unprocessed → processed). Structureless by design.
- **Action** — title, context, project, area, energy, time estimate, status,
  waiting-on, due date.
- **Project** — outcome, area, status (active / someday / done), next action,
  support material.
- **Area** (20k Horizon).
- **Higher horizons** — goals / vision / purpose (light docs).
- **Reference** — kept non-actionable info.
- **CalendarEvent** — two tiers (see §9): **Tier 1** hard landscape
  (`time_specific_action` / `day_specific_action` / `day_specific_info` — the last is
  non-blocking/"free") and **Tier 2** flexible plan-blocks (free, linked to a Next
  Action, written to a dedicated planning calendar). Sync real calendars; don't reinvent.
- **KnowledgeBase entry** — typed by horizon.
- **Review session** — drives the guided weekly review.

---

## 8. AI layer: the Clarify provider seam

A single interface every AI implementation satisfies:

```
ClarifyProvider.clarify(input) -> proposal

input  = { rawCapture, knowledgeBase, systemSnapshot:{ projects, areas, contexts, waitingFor } }
proposal = {
  type: action | project | reference | someday | trash,
  nextAction?, project?: { existingId | newTitle }, area?, context?,
  timeEstimate?, energy?, dueDate?  // dueDate only if true hard-landscape
}
```

- User **approves/corrects** the proposal → committed to the system. (Trust-preserving.)
- Implementations: **HostedClaude** (Opus+Haiku, default), **BringYourOwnKey**,
  **LocalModel** (Ollama/on-device), **Manual/None**.
- **Model router** inside HostedClaude: Haiku for cheap classification, Opus for heavy
  decomposition. Tunable continuously.
- For a single user, pass the whole project+area list in-prompt. **No retrieval/vector
  DB** until a user has hundreds of projects.

---

## 9. Calendar (decided)

Two tiers; the rule of thumb is **read broadly, write narrowly.** Allen's strictness
governs only Tier 1.

**Tier 1 — Hard Landscape (the real GTD calendar).** Only Allen's three types, tagged
in the data model:
- `time_specific_action` — fixed start time ("dentist Tue 10am")
- `day_specific_action` — must happen that day, no fixed time (all-day)
- `day_specific_info` — dated "must KNOW today" note; **not a task; non-blocking/free**
  (most apps forget this one)

Tier-1 events are busy/immovable and only ever user-created or user-**confirmed**. The AI
may *propose* a Tier-1 event (approve/reject) but **never silently writes** one.

**Tier 2 — Flexible Plan blocks.** AI/user time-blocks showing *when* a Next Action might
get done. Written as **free** (never block real availability), relocatable, always linked
back to a Next Action. **The Next Actions list — not the calendar — is the source of
truth.** Delete the block, the task lives on.

**Decided rules:**
- **AI authority = suggest-first / calm:** AI proposes, user confirms. Explicitly reject
  Motion-style global reshuffling / "AI owns your day."
- **Plan-blocks write to a dedicated, separate calendar** ("[App] Planning"), so the
  user's real calendar stays pure in *any* client. (Our in-app "this is just a plan"
  styling does **not** exist on native phone calendars — a separate calendar, not mere
  coloring, is the real safeguard.)
- **Never auto-roll** an incomplete dated item to tomorrow — surface it for explicit
  re-decision (silent migration is what Allen says destroys calendar trust).
- Promotion of a soft block → defended commitment is **opt-in** (user commits), never
  automatic-on-deadline (that smuggles soft work onto the hard landscape).
- The free/busy flag does **not** round-trip reliably across providers (esp. iCloud) —
  the dedicated calendar, not the flag, is the trust safeguard.

**Scope = read-broad, write-narrow first:**
- Read from any calendar early (low risk, high value; informs AI "what can you do now").
- Two-way **write** starts with Google/Outlook + the dedicated planning calendar.
- iCloud write and full "any-calendar" two-way come later.

**Technical path:** start with a **unified calendar API** (e.g. Nylas / Cronofy / etc.)
**behind our own abstraction layer** so we're never locked in; verify current pricing
(public figures are stale) and weigh native Google/Microsoft later for cost. **iCloud has
no real API** (CalDAV + app-specific password only) — this is the main wall. When write
turns on, non-negotiables: delta-token sync + webhook renewal + polling fallback;
anti-loop (event-ID mapping, self-origin marker, idempotent dedup); a deliberate conflict
policy; and envelope-encrypted server-side credential storage (iCloud app passwords are
broad, durable creds — threat-model before holding them).

**Phasing:** (0) two-tier data model in place; (1) read-only sync + AI hard-event
*proposals* + the Weekly Review's two-direction calendar step; (2) two-way write of free
plan-blocks to the dedicated calendar; (3) opt-in promotion + defense-level tuning;
(4) iCloud + native-provider cost optimization.

---

## 10. Build sequence

Full product, sequenced by dependency (each phase = a complete vertical slice we deepen):

1. **Capture + inbox + backend** — local-first capture (voice + text) syncing to
   Supabase. Prove the 2-second promise.
2. **AI clarify + knowledge base** — onboarding seeds KB by horizon; provider seam with
   HostedClaude; propose→approve.
3. **Organize** — projects, next actions, contexts, waiting-for, someday/maybe.
4. **Guided weekly review** — the keystone habit as an enforced flow.
5. **Engage views + multi-device polish + open capture endpoints** (Shortcuts,
   share-sheet, watch).

---

## 11. Decisions locked

- Audience: a real product for others (not just personal).
- Spine: cloud brain + thin, radically-open capture clients.
- AI: proposes, user one-tap approves; knowledge base by GTD horizons; pass live system
  state as context.
- User is technical but **steers product decisions** while Claude builds.
- Devices: PC + mobile are priority (any phone, any PC); Apple Watch later.
- Stack: web-first, TypeScript, Next.js + Supabase, Claude API; PWA for mobile.
- Strategy: open-core, free-forever core, cheap paid AI/sync tier, self-host option.
- Calendar: two-tier (hard landscape + free plan-blocks), read-broad/write-narrow,
  suggest-first AI, plan-blocks on a dedicated calendar, no auto-roll, opt-in promotion,
  unified API behind an abstraction, read-only sync first. (See §9.)

## 12. Open / deferred

- ✅ Data-model schema — drafted & 5-lens-reviewed: [`DATA-MODEL.md`](DATA-MODEL.md) (v0.2).
- ✅ AI clarify input/output contract — drafted & reviewed: [`AI-CLARIFY-CONTRACT.md`](AI-CLARIFY-CONTRACT.md) (v0.2).
- ✅ AI privacy/retention/deletion posture — specified in DATA-MODEL §Data lifecycle
  (TTL'd/redacted snapshots, hard-delete vs soft-delete, export, KMS credential custody).
  *Remaining:* DPA + minimizing third-party PII sent to the LLM; finalize biometric (audio)
  handling.
- Exact onboarding questionnaire content (seeds the KB).
- Unified calendar API vendor choice + **verify current pricing** before committing.
- Write-target calendar UX (dedicated "[App] Planning" calendar) + iCloud credential
  security model (envelope encryption / threat model).
- Duration estimation for plan-blocks (user-set / AI-guess / learned-from-history) —
  the real make-or-break for any scheduling aid.
- Trust telemetry: measure whether plan-blocks are honored vs. silently ignored.
- Privacy/retention story for sending calendar + capture data to the LLM (GDPR/CCPA).
- Billing/metering for the paid AI tier.
- Native + Apple Watch timing.
- Open-source license & repo split for open-core.
