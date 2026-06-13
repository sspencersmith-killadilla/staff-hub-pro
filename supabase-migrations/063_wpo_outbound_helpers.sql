-- Helper: look up a user's email by id (used by outbound WPO dispatch).
create or replace function public.find_user_email_by_id(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email::text from auth.users where id = _user_id limit 1
$$;

revoke all on function public.find_user_email_by_id(uuid) from public, anon, authenticated;
grant execute on function public.find_user_email_by_id(uuid) to service_role;

-- next_retry_at column for outbound retry scheduling (already in 057 schema,
-- but ensure it exists for older databases).
alter table public.integration_dispatches
  add column if not exists next_retry_at timestamptz,
  add column if not exists attempts int not null default 0;

create index if not exists idx_integration_dispatches_outbound_retry
  on public.integration_dispatches(next_retry_at)
  where direction = 'outbound' and (status_code is null or status_code >= 400);
