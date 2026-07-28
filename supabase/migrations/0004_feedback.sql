-- Feedback / support tickets (in-app "Help" form). The table is the source of truth — an email
-- notification layer (Resend, via the custom-domain session) gets added on top later; email can
-- get lost, rows can't. Users insert + see their own; the owner reads everything via the
-- dashboard (service role bypasses RLS there). Same idioms as 0001-0003: FORCE RLS, flat
-- auth.uid() policies, idempotent DDL.

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null default 'support' check (kind in ('support', 'feature')),
  message    text not null check (char_length(message) between 1 and 4000),
  status     text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
alter table public.feedback force row level security;
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert with check (user_id = auth.uid());
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select using (user_id = auth.uid());
-- No update/delete policies: tickets are append-only from the app; triage happens dashboard-side.
