-- Phase 2: Venues / Stages / Rooms / Events
-- Run this in your Supabase SQL Editor. Safe to re-run.

-- 1. Link stages and rooms to a parent venue
alter table public.stages
  add column if not exists venue_id integer references public.venues(id) on delete set null;
alter table public.rooms
  add column if not exists venue_id integer references public.venues(id) on delete set null;

-- 2. Hours/closures live on venues only — drop from stages/rooms
alter table public.stages drop column if exists open_hours;
alter table public.stages drop column if exists closures;
alter table public.rooms  drop column if exists open_hours;
alter table public.rooms  drop column if exists closures;

-- 3. Events become staff-controlled gigs linked to venue/stage/room
alter table public.events
  add column if not exists venue_id integer references public.venues(id) on delete set null,
  add column if not exists stage_id uuid    references public.stages(id) on delete set null,
  add column if not exists room_id  uuid    references public.rooms(id)  on delete set null,
  add column if not exists event_type text,
  add column if not exists featured_guest text,
  add column if not exists open_to_vendors boolean default false;

-- 4. Enable RLS
alter table public.venues enable row level security;
alter table public.stages enable row level security;
alter table public.rooms  enable row level security;
alter table public.events enable row level security;

-- 5. Reset policies on these tables, then recreate (idempotent)
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('venues','stages','rooms','events')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

-- Public read (anonymous can see venues/stages/rooms/events)
create policy "public read venues" on public.venues for select using (true);
create policy "public read stages" on public.stages for select using (true);
create policy "public read rooms"  on public.rooms  for select using (true);
create policy "public read events" on public.events for select using (true);

-- Staff/admin write
create policy "staff write venues" on public.venues for all
  using (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'));

create policy "staff write stages" on public.stages for all
  using (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'));

create policy "staff write rooms" on public.rooms for all
  using (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'));

create policy "staff write events" on public.events for all
  using (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'admin'));
