-- Phase 1 hardening — review follow-up to 0001 (docs/PHASE-1-SUPABASE.md). Idempotent; safe to
-- run once on top of an applied 0001. Addresses confirmed findings from the adversarial review:
--   • pin the RPC's search_path + make SECURITY INVOKER explicit (Supabase lint
--     'function_search_path_mutable');
--   • per-op fault isolation so one malformed op can't wedge a user's whole capture queue;
--   • skew_ms created_at fallback for exact parity with applyOpToServer;
--   • server-authoritative column integrity (server_seq/captured_at can't be forged);
--   • scope EXECUTE to authenticated (was default PUBLIC).
--
-- Residual (accepted for Phase 1): the RPC is SECURITY INVOKER and the captures write policies
-- remain, so a hostile client wielding a valid JWT could still directly PATCH/POST its OWN rows'
-- synced_at/skew_ms/status (never another user's — RLS still isolates). Closing that means routing
-- all writes through a SECURITY DEFINER path; deferred to the server-host move (Vercel).

-- ── server-authoritative columns: forgery-proof at the DB level ──
-- server_seq: BY DEFAULT → ALWAYS identity, so no client (direct write or RPC) can supply inbox
-- ordering. The RPC never lists server_seq in its INSERT, so ALWAYS is transparent to it.
alter table public.captures alter column server_seq set generated always;
-- captured_at: DB-level NOT NULL + default (the RPC still computes/clamps it; this just closes the
-- direct-insert NULL hole that broke the CaptureRow {captured_at: string} contract).
update public.captures set captured_at = coalesce(captured_at, synced_at, now()) where captured_at is null;
alter table public.captures alter column captured_at set default now();
alter table public.captures alter column captured_at set not null;

-- ── the sync RPC, hardened (recreated in place) ──
create or replace function public.sync_capture_ops(p_ops jsonb)
returns setof public.captures
language plpgsql
security invoker
set search_path = ''
as $$
declare
  op         jsonb;
  uid        uuid := auth.uid();
  existing   public.captures%rowtype;
  cid        uuid;
  seq        integer;
  kind       text;
  new_status text;
  touched    uuid[] := '{}';
  v_now      timestamptz := pg_catalog.now();  -- one server clock for the whole batch
  v_captured timestamptz;
  v_skew_ms  integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  for op in select * from pg_catalog.jsonb_array_elements(p_ops)
  loop
    -- Fault isolation: applyOpToServer is a total reducer that never throws, so mirror that here —
    -- a single malformed op (bad cast, out-of-range enum) is skipped, never aborting the batch.
    begin
      cid  := (op ->> 'client_id')::uuid;
      seq  := (op ->> 'client_seq')::integer;
      kind := op ->> 'kind';

      select * into existing from public.captures
        where user_id = uid and client_id = cid for update;

      if found then
        -- (1) idempotent + in-order, and (2) tombstone is terminal
        if seq <= existing.client_seq or existing.status = 'discarded' then
          touched := touched || cid;
          continue;
        end if;

        -- set_status is validated against the allowed set; an out-of-range value is ignored.
        new_status := case
          when kind = 'delete' then 'discarded'
          when kind = 'set_status'
               and (op ->> 'status') in ('inbox', 'clarifying', 'processed', 'discarded')
               then op ->> 'status'
          else existing.status
        end;

        update public.captures set
          client_seq = seq,
          version    = existing.version + 1,
          synced_at  = v_now,
          raw_text   = case when kind = 'edit' then coalesce(op ->> 'raw_text', raw_text) else raw_text end,
          status     = new_status
        where user_id = uid and client_id = cid;
      else
        -- only a create can materialize a new row; a non-create with no row is an orphan (skip)
        if kind = 'create' then
          -- skew from captured_at, falling back to created_at (matches apply.ts:63); an absent or
          -- implausibly-future display captured_at is clamped to the server clock.
          v_captured := coalesce(nullif(op ->> 'captured_at', ''), nullif(op ->> 'created_at', ''))::timestamptz;
          v_skew_ms  := case when v_captured is not null
                             then (extract(epoch from (v_captured - v_now)) * 1000)::integer
                             else 0 end;
          if v_captured is null or v_skew_ms > 300000 then  -- MAX_PLAUSIBLE_SKEW_MS = 5 min
            v_captured := v_now;
          end if;
          insert into public.captures (user_id, client_id, client_seq, raw_text, source, captured_at, synced_at, skew_ms, status, version)
          values (
            uid, cid, seq,
            coalesce(op ->> 'raw_text', ''),
            coalesce(op ->> 'source', 'web'),
            v_captured, v_now, v_skew_ms,
            'inbox', 1
          );
        end if;
      end if;

      touched := touched || cid;
    exception when others then
      continue;  -- skip the offending op; keep draining the rest of the batch
    end;
  end loop;

  return query
    select * from public.captures
    where user_id = uid and client_id = any(touched);
end;
$$;

-- ── lock RPC execution to authenticated callers (was default PUBLIC) ──
revoke all on function public.sync_capture_ops(jsonb) from public, anon;
grant execute on function public.sync_capture_ops(jsonb) to authenticated;
