-- Phase 1: Attendee Itinerary — favorites table.
-- Lets a logged-in user "favorite" any public item (session, community
-- event, streetbeats gig, artist, vendor, room, venue) to build a
-- personalized schedule. Safe to re-run.

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in (
    'session','community_event','gig','artist','vendor','room','venue'
  )),
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

create index if not exists favorites_user_idx on public.favorites(user_id);
create index if not exists favorites_lookup_idx
  on public.favorites(user_id, item_type, item_id);

grant select, insert, delete on public.favorites to authenticated;
grant all on public.favorites to service_role;

alter table public.favorites enable row level security;

drop policy if exists "favorites_self_read" on public.favorites;
create policy "favorites_self_read" on public.favorites
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "favorites_self_insert" on public.favorites;
create policy "favorites_self_insert" on public.favorites
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "favorites_self_delete" on public.favorites;
create policy "favorites_self_delete" on public.favorites
  for delete to authenticated using (user_id = auth.uid());
