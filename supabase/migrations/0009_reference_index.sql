-- Phase 2 · Slice 6 migration: the reference index gets a link, a project tie and soft delete.
--
-- Reference is a POINTER index, not a vault: the row says where the thing lives. `url` and
-- `project_id` are the only two bits worth structuring; `archived` is removal (hard deletes
-- can't exist under whole-row LWW — another device's stale copy would resurrect the row, same
-- reasoning as contexts in 0005). No FK on project_id: rows sync in any order and the UI folds
-- an unknown tie gracefully, exactly as with actions.project_id.
--
-- Apply on top of 0008. Idempotent. Verify with scripts/verify-supabase.mjs.

alter table public.reference_items add column if not exists url        text;
alter table public.reference_items add column if not exists project_id uuid;
alter table public.reference_items add column if not exists archived   boolean not null default false;

-- ─────────────────── sync_gtd, extended with the reference_items columns ───────────────────
-- Full replacement of the 0008 function (same contract, three more columns on one branch).

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
        insert into public.contexts as x
          (user_id, id, name, type, sort_order, archived, updated_at)
        values (
          uid, (r ->> 'id')::uuid,
          pg_catalog.left(coalesce(r ->> 'name', ''), 200),
          coalesce(r ->> 'type', 'custom'),
          coalesce((r ->> 'sort_order')::double precision, 0),
          coalesce((r ->> 'archived')::boolean, false),
          v_updated
        )
        on conflict (user_id, id) do update set
          name = excluded.name, type = excluded.type,
          sort_order = excluded.sort_order, archived = excluded.archived,
          updated_at = excluded.updated_at
        where x.updated_at < excluded.updated_at;

      elsif t = 'projects' then
        insert into public.projects as x
          (user_id, id, title, status, source_capture_id, created_at, updated_at, sort_order,
           notes)
        values (
          uid, (r ->> 'id')::uuid,
          pg_catalog.left(coalesce(r ->> 'title', ''), 4000),
          coalesce(r ->> 'status', 'active'),
          (r ->> 'source_capture_id')::uuid,
          coalesce((r ->> 'created_at')::timestamptz, v_now),
          v_updated,
          coalesce((r ->> 'sort_order')::double precision, 0),
          pg_catalog.left(r ->> 'notes', 20000)
        )
        on conflict (user_id, id) do update set
          title = excluded.title, status = excluded.status,
          source_capture_id = excluded.source_capture_id,
          updated_at = excluded.updated_at, sort_order = excluded.sort_order,
          notes = excluded.notes
        where x.updated_at < excluded.updated_at;

      elsif t = 'actions' then
        insert into public.actions as x
          (user_id, id, title, context_id, project_id, status, is_two_minute, energy,
           waiting_on_text, waiting_since, source_capture_id, created_at, updated_at, sort_order,
           resurface_on, notes)
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
          coalesce((r ->> 'sort_order')::double precision, 0),
          (r ->> 'resurface_on')::date,
          pg_catalog.left(r ->> 'notes', 20000)
        )
        on conflict (user_id, id) do update set
          title = excluded.title, context_id = excluded.context_id,
          project_id = excluded.project_id, status = excluded.status,
          is_two_minute = excluded.is_two_minute, energy = excluded.energy,
          waiting_on_text = excluded.waiting_on_text, waiting_since = excluded.waiting_since,
          source_capture_id = excluded.source_capture_id,
          updated_at = excluded.updated_at, sort_order = excluded.sort_order,
          resurface_on = excluded.resurface_on, notes = excluded.notes
        where x.updated_at < excluded.updated_at;

      elsif t = 'reference_items' then
        insert into public.reference_items as x
          (user_id, id, title, body, url, project_id, archived, source_capture_id,
           created_at, updated_at)
        values (
          uid, (r ->> 'id')::uuid,
          pg_catalog.left(coalesce(r ->> 'title', ''), 4000),
          pg_catalog.left(r ->> 'body', 20000),
          pg_catalog.left(r ->> 'url', 2000),
          (r ->> 'project_id')::uuid,
          coalesce((r ->> 'archived')::boolean, false),
          (r ->> 'source_capture_id')::uuid,
          coalesce((r ->> 'created_at')::timestamptz, v_now),
          v_updated
        )
        on conflict (user_id, id) do update set
          title = excluded.title, body = excluded.body,
          url = excluded.url, project_id = excluded.project_id,
          archived = excluded.archived,
          source_capture_id = excluded.source_capture_id,
          updated_at = excluded.updated_at
        where x.updated_at < excluded.updated_at;

      elsif t = 'review_sessions' then
        -- Write-once on the client; the LWW guard stays anyway so a replay is a no-op.
        insert into public.review_sessions as x
          (user_id, id, started_at, completed_at, updated_at)
        values (
          uid, (r ->> 'id')::uuid,
          coalesce((r ->> 'started_at')::timestamptz, v_now),
          coalesce((r ->> 'completed_at')::timestamptz, v_now),
          v_updated
        )
        on conflict (user_id, id) do update set
          started_at = excluded.started_at, completed_at = excluded.completed_at,
          updated_at = excluded.updated_at
        where x.updated_at < excluded.updated_at;
      end if;
    exception when others then
      continue; -- skip the offending row; keep draining the batch
    end;
  end loop;

  -- Pull: everything of mine that changed after the client's watermark, whoever changed it
  -- (including rows this very call just applied — the client's LWW merge no-ops on echoes).
  -- Aliases must not collide with this function's variables (t, r) — PL/pgSQL treats an
  -- unqualified identifier in SQL as either, and errors on the ambiguity (42702).
  with changed as (
    select 'contexts' as tbl_name, pg_catalog.to_jsonb(c) - 'user_id' - 'server_seq' as row_data, c.server_seq
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
    union all
    select 'review_sessions', pg_catalog.to_jsonb(rs) - 'user_id' - 'server_seq', rs.server_seq
      from public.review_sessions rs where rs.user_id = uid and rs.server_seq > p_since
  )
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table', tbl_name, 'row', row_data) order by server_seq), '[]'::jsonb),
    coalesce(pg_catalog.max(server_seq), p_since)
  into v_rows, v_max
  from changed;

  return pg_catalog.jsonb_build_object('rows', v_rows, 'max_seq', v_max);
end;
$$;

revoke all on function public.sync_gtd(jsonb, bigint) from public, anon;
grant execute on function public.sync_gtd(jsonb, bigint) to authenticated;
