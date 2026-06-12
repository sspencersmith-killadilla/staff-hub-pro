-- WPO event sync: add status/assignee on events + activity log + helper.

alter table public.events
  add column if not exists wpo_status text,
  add column if not exists wpo_assignee_id uuid references auth.users(id) on delete set null;

create table if not exists public.event_activity_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  source text not null default 'wpo',
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_activity_log_event_created
  on public.event_activity_log(event_id, created_at desc);

grant select on public.event_activity_log to authenticated;
grant all on public.event_activity_log to service_role;

alter table public.event_activity_log enable row level security;

drop policy if exists eal_staff_read on public.event_activity_log;
create policy eal_staff_read on public.event_activity_log
  for select to authenticated using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
  );

-- Lookup helper used by the WPO inbound webhook.
create or replace function public.find_user_id_by_email(_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(_email) limit 1
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;
