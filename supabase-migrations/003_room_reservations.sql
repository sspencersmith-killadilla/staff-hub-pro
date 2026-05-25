-- Phase 3: Room Reservations
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.room_reservations (
  id uuid primary key default gen_random_uuid()
);

alter table public.room_reservations
  add column if not exists room_id uuid references public.rooms(id) on delete cascade,
  add column if not exists requester_name text,
  add column if not exists requester_email text,
  add column if not exists requester_user_id uuid references auth.users(id) on delete set null,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists party_size integer,
  add column if not exists purpose text,
  add column if not exists notes text,
  add column if not exists status text not null default 'pending',
  add column if not exists decided_by uuid references auth.users(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_note text,
  add column if not exists created_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname='room_reservations_status_check') then
    alter table public.room_reservations
      add constraint room_reservations_status_check
      check (status in ('pending','approved','declined','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname='room_reservations_time_order') then
    alter table public.room_reservations
      add constraint room_reservations_time_order check (ends_at > starts_at);
  end if;
end $$;

create index if not exists room_reservations_room_idx
  on public.room_reservations (room_id, starts_at);
create index if not exists room_reservations_status_idx
  on public.room_reservations (status, starts_at);

alter table public.room_reservations enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname='public' and tablename='room_reservations'
  loop
    execute format('drop policy if exists %I on public.room_reservations', r.policyname);
  end loop;
end$$;

-- Requesters can read their own
create policy "requester reads own" on public.room_reservations
  for select using (auth.uid() = requester_user_id);

-- Public can create a pending request
create policy "anyone can request" on public.room_reservations
  for insert with check (status = 'pending');

-- Staff/admin full access
create policy "staff full access" on public.room_reservations
  for all
  using (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'));
