-- Phase 2 migration: GTD organize-domain sync (contexts / projects / actions / reference_items).
--
-- Model: per-user REPLICA tables with whole-row last-write-wins. The client is authoritative for
-- structure (no cross-table FKs here — rows can arrive in any order and the UI already folds
-- orphans gracefully); the server provides durability, cross-device fan-out, and isolation.
--   • `updated_at` is the LWW clock (client-set, clamped when implausibly future — a bad device
--     clock must not make rows permanently unbeatable).
--   • `server_seq` is the incremental-pull cursor: ONE shared sequence, stamped by trigger on
--     every insert/update, so no client can forge it and a pull watermark totally orders changes.
--   • `sync_gtd(p_changes, p_since)` does push+pull in one round trip: LWW-upserts the batch
--     (per-row fault isolation, mirrors 0002), then returns every row with server_seq > p_since.
-- Same residual as 0002: a hostile client with a valid JWT can mangle ITS OWN rows via direct
-- table writes (never another user's — FORCE RLS). Accepted until the server-host move.
--
-- Apply on top of 0001+0002 (idempotent). Verify with scripts/verify-supabase.mjs.

create sequence if not exists public.gtd_seq;

-- Stamp the authoritative change cursor on every write, whatever the path (RPC or direct).
create or replace function public.gtd_stamp_server_seq()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.server_seq := pg_catalog.nextval('public.gtd_seq');
  return new;
end;
$$;

-- ───────────────────────────────────── tables ─────────────────────────────────────
-- Composite PK (user_id, id): the id is the client-generated uuid (idempotency key), scoped
-- per user so no one can squat or collide with another user's ids (mirrors captures'
-- unique(user_id, client_id) idiom).

create table if not exists public.contexts (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         uuid not null,
  name       text not null default '',
  type       text not null default 'custom'
               check (type in ('tool', 'location', 'person', 'energy', 'custom')),
  sort_order double precision not null default 0,
  updated_at timestamptz not null,
  server_seq bigint not null default 0,
  primary key (user_id, id)
);

create table if not exists public.projects (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                uuid not null,
  title             text not null default '',
  status            text not null default 'active'
                      check (status in ('active', 'someday', 'on_hold', 'completed', 'dropped')),
  source_capture_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null,
  sort_order        double precision not null default 0,
  server_seq        bigint not null default 0,
  primary key (user_id, id)
);

create table if not exists public.actions (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                uuid not null,
  title             text not null default '',
  context_id        uuid,
  project_id        uuid,
  status            text not null default 'active'
                      check (status in ('active', 'waiting', 'scheduled', 'someday', 'done', 'dropped')),
  is_two_minute     boolean not null default false,
  energy            text check (energy is null or energy in ('low', 'medium', 'high')),
  waiting_on_text   text,
  waiting_since     timestamptz,
  source_capture_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null,
  sort_order        double precision not null default 0,
  server_seq        bigint not null default 0,
  primary key (user_id, id)
);

create table if not exists public.reference_items (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                uuid not null,
  title             text not null default '',
  body              text,
  source_capture_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null,
  server_seq        bigint not null default 0,
  primary key (user_id, id)
);

create index if not exists contexts_user_seq_idx        on public.contexts (user_id, server_seq);
create index if not exists projects_user_seq_idx        on public.projects (user_id, server_seq);
create index if not exists actions_user_seq_idx         on public.actions (user_id, server_seq);
create index if not exists reference_items_user_seq_idx on public.reference_items (user_id, server_seq);

drop trigger if exists contexts_stamp_seq on public.contexts;
create trigger contexts_stamp_seq before insert or update on public.contexts
  for each row execute function public.gtd_stamp_server_seq();
drop trigger if exists projects_stamp_seq on public.projects;
create trigger projects_stamp_seq before insert or update on public.projects
  for each row execute function public.gtd_stamp_server_seq();
drop trigger if exists actions_stamp_seq on public.actions;
create trigger actions_stamp_seq before insert or update on public.actions
  for each row execute function public.gtd_stamp_server_seq();
drop trigger if exists reference_items_stamp_seq on public.reference_items;
create trigger reference_items_stamp_seq before insert or update on public.reference_items
  for each row execute function public.gtd_stamp_server_seq();

-- ───────────────────────────────────── RLS ─────────────────────────────────────

alter table public.contexts enable row level security;
alter table public.contexts force row level security;
drop policy if exists contexts_select on public.contexts;
create policy contexts_select on public.contexts for select using (user_id = auth.uid());
drop policy if exists contexts_insert on public.contexts;
create policy contexts_insert on public.contexts for insert with check (user_id = auth.uid());
drop policy if exists contexts_update on public.contexts;
create policy contexts_update on public.contexts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists contexts_delete on public.contexts;
create policy contexts_delete on public.contexts for delete using (user_id = auth.uid());

alter table public.projects enable row level security;
alter table public.projects force row level security;
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select using (user_id = auth.uid());
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert with check (user_id = auth.uid());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete using (user_id = auth.uid());

alter table public.actions enable row level security;
alter table public.actions force row level security;
drop policy if exists actions_select on public.actions;
create policy actions_select on public.actions for select using (user_id = auth.uid());
drop policy if exists actions_insert on public.actions;
create policy actions_insert on public.actions for insert with check (user_id = auth.uid());
drop policy if exists actions_update on public.actions;
create policy actions_update on public.actions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists actions_delete on public.actions;
create policy actions_delete on public.actions for delete using (user_id = auth.uid());

alter table public.reference_items enable row level security;
alter table public.reference_items force row level security;
drop policy if exists reference_items_select on public.reference_items;
create policy reference_items_select on public.reference_items for select using (user_id = auth.uid());
drop policy if exists reference_items_insert on public.reference_items;
create policy reference_items_insert on public.reference_items for insert with check (user_id = auth.uid());
drop policy if exists reference_items_update on public.reference_items;
create policy reference_items_update on public.reference_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists reference_items_delete on public.reference_items;
create policy reference_items_delete on public.reference_items for delete using (user_id = auth.uid());

-- ─────────────────────────── push+pull RPC (SECURITY INVOKER) ───────────────────────────

create or replace function public.sync_gtd(p_changes jsonb, p_since bigint default 0)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ch        jsonb;
  uid       uuid := auth.uid();
  v_now     timestamptz := pg_catalog.now();
  t         text;
  r         jsonb;
  v_updated timestamptz;
  v_rows    jsonb;
  v_max     bigint;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  for ch in select * from pg_catalog.jsonb_array_elements(coalesce(p_changes, '[]'::jsonb))
  loop
    -- Fault isolation (mirrors 0002): a malformed row (bad cast, out-of-range enum via the
    -- table CHECKs) is skipped, never aborting the rest of the batch.
    begin
      t := ch ->> 'table';
      r := ch -> 'row';
      v_updated := (r ->> 'updated_at')::timestamptz;
      if v_updated is null then
        continue; -- no LWW clock, no merge decision — skip
      end if;
      -- Clamp an implausibly-future clock (same 5-min plausibility bound as the capture spine).
      if v_updated > v_now + interval '5 minutes' then
        v_updated := v_now + interval '5 minutes';
      end if;

      if t = 'contexts' then
        insert into public.contexts as x (user_id, id, name, type, sort_order, updated_at)
        values (
          uid, (r ->> 'id')::uuid,
          pg_catalog.left(coalesce(r ->> 'name', ''), 200),
          coalesce(r ->> 'type', 'custom'),
          coalesce((r ->> 'sort_order')::double precision, 0),
          v_updated
        )
        on conflict (user_id, id) do update set
          name = excluded.name, type = excluded.type,
          sort_order = excluded.sort_order, updated_at = excluded.updated_at
        where x.updated_at < excluded.updated_at;

      elsif t = 'projects' then
        insert into public.projects as x
          (user_id, id, title, status, source_capture_id, created_at, updated_at, sort_order)
        values (
          uid, (r ->> 'id')::uuid,
          pg_catalog.left(coalesce(r ->> 'title', ''), 4000),
          coalesce(r ->> 'status', 'active'),
          (r ->> 'source_capture_id')::uuid,
          coalesce((r ->> 'created_at')::timestamptz, v_now),
          v_updated,
          coalesce((r ->> 'sort_order')::double precision, 0)
        )
        on conflict (user_id, id) do update set
          title = excluded.title, status = excluded.status,
          source_capture_id = excluded.source_capture_id,
          updated_at = excluded.updated_at, sort_order = excluded.sort_order
        where x.updated_at < excluded.updated_at;

      elsif t = 'actions' then
        insert into public.actions as x
          (user_id, id, title, context_id, project_id, status, is_two_minute, energy,
           waiting_on_text, waiting_since, source_capture_id, created_at, updated_at, sort_order)
        values (
          uid, (r ->> 'id')::uuid,
          pg_catalog.left(coalesce(r ->> 'title', ''), 4000),
          (r ->> 'context_id')::uuid,
          (r ->> 'project_id')::uuid,
          coalesce(r ->> 'status', 'active'),
          coalesce((r ->> 'is_two_minute')::boolean, false),
          r ->> 'energy',
          pg_catalog.left(r ->> 'waiting_on_text', 1000),
          (r ->> 'waiting_since')::timestamptz,
          (r ->> 'source_capture_id')::uuid,
          coalesce((r ->> 'created_at')::timestamptz, v_now),
          v_updated,
          coalesce((r ->> 'sort_order')::double precision, 0)
        )
        on conflict (user_id, id) do update set
          title = excluded.title, context_id = excluded.context_id,
          project_id = excluded.project_id, status = excluded.status,
          is_two_minute = excluded.is_two_minute, energy = excluded.energy,
          waiting_on_text = excluded.waiting_on_text, waiting_since = excluded.waiting_since,
          source_capture_id = excluded.source_capture_id,
          updated_at = excluded.updated_at, sort_order = excluded.sort_order
        where x.updated_at < excluded.updated_at;

      elsif t = 'reference_items' then
        insert into public.reference_items as x
          (user_id, id, title, body, source_capture_id, created_at, updated_at)
        values (
          uid, (r ->> 'id')::uuid,
          pg_catalog.left(coalesce(r ->> 'title', ''), 4000),
          pg_catalog.left(r ->> 'body', 20000),
          (r ->> 'source_capture_id')::uuid,
          coalesce((r ->> 'created_at')::timestamptz, v_now),
          v_updated
        )
        on conflict (user_id, id) do update set
          title = excluded.title, body = excluded.body,
          source_capture_id = excluded.source_capture_id,
          updated_at = excluded.updated_at
        where x.updated_at < excluded.updated_at;
      end if;
    exception when others then
      continue; -- skip the offending row; keep draining the batch
    end;
  end loop;

  -- Pull: everything of mine that changed after the client's watermark, whoever changed it
  -- (including rows this very call just applied — the client's LWW merge no-ops on echoes).
  with changed as (
    select 'contexts' as t, pg_catalog.to_jsonb(c) - 'user_id' - 'server_seq' as r, c.server_seq
      from public.contexts c where c.user_id = uid and c.server_seq > p_since
    union all
    select 'projects', pg_catalog.to_jsonb(p) - 'user_id' - 'server_seq', p.server_seq
      from public.projects p where p.user_id = uid and p.server_seq > p_since
    union all
    select 'actions', pg_catalog.to_jsonb(a) - 'user_id' - 'server_seq', a.server_seq
      from public.actions a where a.user_id = uid and a.server_seq > p_since
    union all
    select 'reference_items', pg_catalog.to_jsonb(ri) - 'user_id' - 'server_seq', ri.server_seq
      from public.reference_items ri where ri.user_id = uid and ri.server_seq > p_since
  )
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table', t, 'row', r) order by server_seq), '[]'::jsonb),
    coalesce(pg_catalog.max(server_seq), p_since)
  into v_rows, v_max
  from changed;

  return pg_catalog.jsonb_build_object('rows', v_rows, 'max_seq', v_max);
end;
$$;

revoke all on function public.sync_gtd(jsonb, bigint) from public, anon;
grant execute on function public.sync_gtd(jsonb, bigint) to authenticated;
