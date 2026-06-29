# GTD App — Data Model (v0.2, post-review)

> Concrete schema for Phase 1+. Postgres (Supabase). Pairs with
> [`AI-CLARIFY-CONTRACT.md`](AI-CLARIFY-CONTRACT.md) and [`FOUNDATIONS.md`](FOUNDATIONS.md).
> v0.2 folds in the 5-lens adversarial review (GTD, data-modeling, LLM-contract,
> offline-sync, security/privacy).

## Conventions

- **Every user-owned table carries `user_id uuid NOT NULL`** (denormalized onto child
  tables too — no multi-hop join RLS) and uses **`FORCE ROW LEVEL SECURITY`** with a flat
  policy `user_id = auth.uid()`. CI fails if any table lacks a policy. (Omitted from the
  per-table rows below for brevity — assume it on all of them.)
- **Cross-tenant integrity:** FKs are **composite, including `user_id`** (each parent has
  `UNIQUE(id, user_id)`), so a row can never reference another user's row.
- **Enums = `text` + `CHECK` constraint** (not native Postgres enums) so values can be
  added/renamed inside a normal transaction. Allowed values listed inline below.
- **Concurrency = monotonic `version int` (or `lock_version`) on every mutable table.**
  Writes send `If-Match`; the server rejects on mismatch (see §Sync). Prefer this over
  `updated_at` to avoid clock-tie ambiguity.
- **`ON DELETE` is explicit per FK** (Postgres defaults to RESTRICT, which would block
  account deletion). Default: lineage / `project_id` / `area_id` / `context_id` /
  `delegated_to` / `calendar_events.action_id` → **SET NULL**;
  `calendars.account_id` / `calendar_events.calendar_id` → **CASCADE**. True account
  deletion runs an explicit purge routine (see §Data lifecycle).
- PKs `uuid default gen_random_uuid()`. Times `timestamptz`. Soft-delete via `status`
  enums for GTD flows; **hard-delete is a separate, real operation** (§Data lifecycle).

## The trust spine: offline-first capture (corrected)

"Capture never fails" — and the original "append-only ⇒ no conflict resolution" framing
was too loose. Captures are *mutable* (status changes; users edit bad transcripts or
delete mis-captures, sometimes offline before the create has synced). So:

1. On-device, every capture gets a **client UUID (`client_id`)** before any network call,
   and writes to a **local op-queue** (IndexedDB) first — instant, fully offline.
2. The queue is an **ordered, monotonically-sequenced op-log per `client_id`**:
   `create → edit → set_status → delete`, each stamped with `client_seq`.
3. The server applies ops **idempotently and in sequence**, ignoring any op with a
   `client_seq` ≤ the row's current sequence. A late-arriving stale `create`/`edit`
   **cannot resurrect** a `discarded` capture (deletion is a tombstone: `status=discarded`,
   never un-set by older ops).
4. **Ordering/aging uses the server clock**, not the device: `synced_at` (server-stamped)
   or a server sequence is authoritative for inbox order and Waiting-For aging.
   `captured_at` (device clock) is display-only; implausible values (> now + skew window)
   are clamped/flagged, and a recorded `skew_ms` makes drift observable.
5. **Audio is a two-phase, content-addressed handshake** (so the row syncing while the
   audio upload dies can't silently lose the real content): the row syncs first; audio
   uploads to a deterministic key `audio/{user_id}/{client_id}.webm` (idempotent
   overwrite); `captures.audio_status` tracks `none|pending|uploading|stored|failed`;
   **clarify is blocked** on a capture whose `raw_text` is empty AND `audio_status != stored`.
6. Organizing edits are server-authoritative with the `version` optimistic-concurrency
   contract below — **no CRDT**, but a defined conflict story (not "no conflicts").

---

## Core entities

### `profiles` — 1:1 with the Supabase auth user
| column | type | notes |
|---|---|---|
| `id` | uuid PK | = auth.users.id |
| `display_name` | text | |
| `timezone` | text | IANA tz; anchors relative-date resolution |
| `working_hours` | jsonb | engage/scheduling hints |
| `energy_pattern` | jsonb | energy-aware suggestions |
| `onboarding_completed` | bool | gates first-run KB questionnaire |
| `settings` | jsonb | app prefs (theme, defense level…) |
| `ai_provider` | text+CHECK | `hosted_claude` \| `byo_key` \| `local` \| `manual` |

> **BYO key is never stored in `settings` plaintext** — it goes through the same
> KMS-grade custody as calendar credentials (§Data lifecycle), or stays client-side and
> never transits our server (decided per provider; see FOUNDATIONS §12).

### `captures` — the raw inbox
| column | type | notes |
|---|---|---|
| `id` | uuid PK | server id |
| `client_id` | uuid | device-generated; `UNIQUE(user_id, client_id)` idempotency key |
| `client_seq` | int | per-row op sequence (out-of-order detection) |
| `raw_text` | text | transcript or typed text |
| `audio_key` | text null | storage object key (NOT a URL); private bucket |
| `audio_status` | text+CHECK | `none` \| `pending` \| `uploading` \| `stored` \| `failed` |
| `source` | text+CHECK | `web` \| `ios_pwa` \| `android_pwa` \| `watch` \| `shortcut` \| `share_sheet` \| `email` \| `api` |
| `captured_at` | timestamptz | device clock — **display only** |
| `synced_at` | timestamptz | server clock — **authoritative ordering/aging** |
| `skew_ms` | int null | recorded device/server delta |
| `status` | text+CHECK | `inbox` \| `clarifying` \| `processed` \| `discarded` |
| `version` | int | optimistic concurrency |

A capture yields **one or many** items; provenance is the `clarification_items` join
table (below), not a single `resulting_item_id`.

### `projects` — outcomes needing >1 action (Horizon 10k)
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | the outcome ("Maui trip booked") |
| `outcome` | text null | "what done looks like" (Natural Planning) |
| `area_id` | uuid FK→areas null | |
| `goal_id` | uuid FK→horizons null | "advances goal X" |
| `status` | text+CHECK | `active` \| `someday` \| `on_hold` \| `completed` \| `dropped` |
| `next_action_needed` | bool default false | **set true the instant the project's actionable set empties** |
| `stalled_since` | timestamptz null | when it went stale (engage views surface this continuously) |
| `last_reviewed_at` | timestamptz null | Weekly-Review instrumentation |
| `notes` | text null | lightweight support material |
| `clarification_id` | uuid FK→clarifications null | lineage |
| `version` | int | |

> **Cardinal invariant (event-driven, not review-time):** when an action transitions to
> `done`/`dropped`, or a Waiting-For resolves, and it was an active project's *last*
> actionable item → set `next_action_needed=true`, `stalled_since=now()`, and route the
> user through the propose→approve flow to name the next action (or mark the project
> complete). Completing the last action without a successor is a deliberate, surfaced act.

### `actions` — next actions / the things you DO (runway)
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | **verb-first** ("Email venue re: availability") |
| `project_id` | uuid FK→projects null | standalone allowed |
| `area_id` | uuid FK→areas null | for standalone actions |
| `context_id` | uuid FK→contexts null | @computer, @errands, person-agenda… |
| `status` | text+CHECK | `active` \| `waiting` \| `scheduled` \| `someday` \| `done` \| `dropped` |
| `delegated_to` | uuid FK→people **null** | **optional** even when `status=waiting` |
| `waiting_on_kind` | text+CHECK null | `person` \| `event` \| `external` (for non-person Waiting-For) |
| `waiting_on_text` | text null | "the check to clear", "the part to arrive" |
| `waiting_since` | date null | aging anchor |
| `energy` | text+CHECK null | `low` \| `medium` \| `high` |
| `time_estimate_minutes` | int null | |
| `is_two_minute` | bool default false | flagged at clarify; **engage shows "Do it now → done"** |
| `due_date` | date null | a **true deadline** only |
| `defer_until` | date null | **tickler**: hide until this date |
| `flagged_today` | bool default false | user-starred for today |
| `last_reviewed_at` | timestamptz null | for stale-someday surfacing |
| `sort_order` | numeric | |
| `clarification_id` | uuid FK→clarifications null | lineage |
| `version` | int | |

> Calendar linkage is **one-directional**: `calendar_events.action_id` points here. We
> dropped `actions.calendar_event_id` (redundant bidirectional FK). Waiting-For =
> `status=waiting` (with person *or* `waiting_on_*`). Someday/Maybe = `status=someday`
> (mutually exclusive with `waiting`/`on_hold`). Agendas = `context.type=person`.

### `areas` — Areas of Focus / Responsibility (Horizon 20k)
`id` · `title` (Health, Finances, Acme-work…) · `description?` · `is_active` ·
`last_reviewed_at?` · `sort_order`

### `horizons` — Goals / Vision / Purpose (30k–50k)
`id` · `level` (`goal_30k`|`vision_40k`|`purpose_50k`) · `title` · `description?` ·
`area_id?` · `target_date?` · `status` (`active`|`achieved`|`dropped`) · `last_reviewed_at?`

### `contexts`
`id` · `name` (@computer…) · `type` (`tool`|`location`|`person`|`energy`|`custom`) ·
`person_id?`→people (when `type=person`) · `icon?` · `sort_order`

### `people`
`id` · `name` · `relationship?` (`report`|`manager`|`client`|`family`|`friend`|`vendor`|`other`) · `notes?`

### `reference_items`
`id` · `title` · `body?` (md) · `url?` · `tags text[]` · `area_id?` · `clarification_id?` · `version`

---

## Knowledge base (AI context)

KB sent to the AI = `profiles` + active `kb_entries` + a live system snapshot (areas,
projects, contexts, people — derived, not duplicated).

### `kb_entries`
`id` · `horizon_level` (`profile`|`preference`|`area_20k`|`goal_30k`|`vision_40k`|`purpose_50k`|`person`|`context`) ·
`key` · `value` · `structured jsonb?` · `source` (`onboarding`|`ai_proposed`|`user_added`) ·
`status` (`active`|`proposed`|`dismissed`) · `confidence real?` · `version`

> AI-proposed entries land `status=proposed` → user approves. Never auto-applied.

---

## AI clarify + provenance

### `clarifications` — one per processing *attempt*
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `capture_id` | uuid FK→captures | |
| `clarify_request_id` | uuid | client-supplied; `UNIQUE(capture_id, clarify_request_id)` → idempotent retries |
| `capture_version` | int | the capture `version` this was computed from |
| `model` / `route` | text | which provider/model + triage route fired |
| `input_snapshot` | jsonb null | **redacted/TTL'd** — see §Data lifecycle (don't keep raw KB forever) |
| `proposal` | jsonb | structured proposal (may contain many items) |
| `status` | text+CHECK | `pending` \| `approved` \| `corrected` \| `rejected` \| `partial` |
| `user_feedback` | jsonb null | correction diff (opt-in for tuning) |
| `resolved_at` | timestamptz null | |

> **One live proposal per capture:** partial unique index `UNIQUE(capture_id) WHERE
> status='pending'`. **Approval guards:** reject if `capture.status != clarifying` or
> `capture.version != clarification.capture_version` ("capture changed — re-clarify"),
> and never commit against a `discarded` capture.

### `clarification_items` — provenance + idempotent approval (answers old Q3)
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `clarification_id` | uuid FK→clarifications | |
| `capture_id` | uuid FK→captures | |
| `item_index` | int | position in `proposal.items[]`; `UNIQUE(clarification_id, item_index)` |
| `produced_entity_type` | text+CHECK | `action`\|`project`\|`reference`\|`calendar_event`\|… |
| `produced_entity_id` | uuid null | set on approval; the dedup key makes re-approval a no-op |
| `decision` | text+CHECK | `approved`\|`corrected`\|`rejected` |

---

## Calendar (FOUNDATIONS §9)

### `calendar_accounts`
`id` · `provider` (`google`|`microsoft`|`icloud_caldav`|`ics`) · `external_account_id` ·
`credentials_ref` · `sync_token?` · `status` (`connected`|`error`|`revoked`)

> **Credential custody (BLOCKER-grade):** credentials live in a real **KMS with per-tenant
> keys**, decryptable **only by a dedicated sync worker** (not the app server), with
> rotation + decrypt-audit. RLS does **not** protect this column. **Prefer OAuth; defer
> iCloud app-specific passwords** (broad, durable creds — a compromised key = mass exfil).

### `calendars`
`id` · `account_id`→calendar_accounts (CASCADE) · `external_calendar_id` · `name` ·
`color?` · `access_role` (`read`|`write`) · `sync_enabled` · `is_planning_target`
(the dedicated "[App] Planning" calendar for Tier-2 blocks)

### `calendar_events`
`id` · `calendar_id?`→calendars (CASCADE) · `external_event_id?` ·
`tier` (`hard`|`plan`) · `hard_type?` (`time_specific_action`|`day_specific_action`|`day_specific_info`) ·
`title` · `start_at` · `end_at?` · `all_day` ·
`transparency` (`busy`|`free` — **Tier-2 and `day_specific_info` are always `free`**) ·
`action_id?`→actions (SET NULL) · `source` (`external_sync`|`app_created`|`ai_proposed`) ·
`status` (`confirmed`|`proposed`|`cancelled`) · `etag?` · `last_synced_at?` · `version`

---

## Weekly Review (instrumented — not just a checklist UI)

### `review_sessions`
`id` · `type` (`weekly`|`daily`) · `status` (`in_progress`|`completed`) ·
`checklist_state jsonb` · `stats jsonb` · `started_at`/`completed_at`

**Defined "Get Current" query set** (each step has a real input list):
- **Inbox to zero:** `captures WHERE status='inbox'`.
- **Projects review:** `projects WHERE status='active'`; **stalled** = `next_action_needed`
  / zero actionable actions; order by `last_reviewed_at`.
- **Waiting-For:** `actions WHERE status='waiting'` ordered by `waiting_since` (aging).
- **Tickler now-active:** `actions WHERE defer_until <= today`.
- **Stale Someday:** `status='someday'` ordered by `last_reviewed_at`.
- **Higher horizons:** `areas`/`horizons` by `last_reviewed_at` cadence.
- **Calendar two-direction:** backward = past `calendar_events` since last review (harvest
  follow-ups → captures); forward = upcoming `calendar_events` (capture prep actions).

Completing relevant steps stamps `last_reviewed_at` so "completed" can't hide stale loops.

---

## Data lifecycle, retention & deletion (security/privacy must-fix)

- **AI snapshots:** `clarifications.input_snapshot` is hard-**TTL'd** and **redacted** —
  store *pointers to KB rows*, not the full KB text; never keep raw indefinitely.
- **Corrections for tuning:** `user_feedback` is **opt-in / default-off**, separately
  consented.
- **Audio:** **private bucket**, `storage.objects` path-RLS to `auth.uid()`, short-TTL
  signed URLs at read time, store only the key. Covered by retention + deletion. (Voice =
  potentially biometric → explicit handling note for GDPR Art. 9.)
- **Hard delete ≠ GTD soft delete:** a real purge that removes the row **plus** its
  snapshots, audio object, and calendar mirror. **Account deletion** cascades the whole FK
  graph + storage bucket + revokes calendar credentials.
- **Export:** machine-readable data export (GDPR Art. 20 / CCPA).
- **Local queue at rest:** delete IndexedDB entries on server-ack; **clear all local stores
  on logout / account-switch**; consider WebCrypto at-rest encryption of the queue + cached
  KB (shared/stolen device).

---

## Resolved modeling decisions

- **Someday = status** (not a table) + `last_reviewed_at`, exclusive with `waiting`/`on_hold`. ✔
- **Agendas = person-context**, with a clear path to a future `action_contexts` join if an
  action needs to be both `@phone` and `@Sarah`. ✔
- **Multi-item lineage** needs the **`clarification_items` join table** (not just
  `source_capture_id`) — it also serves as the idempotent-approval dedup key. ✔
- **`actions` stays flat** (text + CHECK), not subtype tables. ✔
- **Indexes:** FK columns; `user_id`-leading composites for list views
  `(user_id,status,context_id)`, `(user_id,project_id)`; Waiting-For `(user_id,status,waiting_since)`;
  tickler `(user_id,defer_until)`; partial `WHERE status='pending'` on clarifications;
  `UNIQUE(user_id,client_id)` on captures. ✔

## Deferred (noted, not now)

- Drop `energy` as a context *type* (keep energy as the action field). · `action_contexts`
  multi-context join. · Typed `user_feedback` schema. · IndexedDB poison-message handling. ·
  DPA + minimizing third-party PII sent to the LLM.
