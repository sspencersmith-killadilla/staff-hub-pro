alter table public.sessions
  add column if not exists staff_owner_name text;

alter table public.events
  add column if not exists staff_owner_name text;
