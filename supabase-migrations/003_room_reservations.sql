-- Phase 3: Room Reservations
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.room_reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requester_name text not null,
  requester_email text not null,
  requester_user_id uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer,
  purpose text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending','approved','declined','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  constraint room_reservations_time_order check (ends_at > starts_at)
);

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
