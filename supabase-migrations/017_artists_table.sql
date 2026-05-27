-- Streetbeats: split "artist" from "user profile" so one account can hold
-- multiple performer identities. Safe to re-run.

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  genre text,
  bio text,
  avatar_url text,
  avatar_focal_x smallint not null default 50 check (avatar_focal_x between 0 and 100),
  avatar_focal_y smallint not null default 50 check (avatar_focal_y between 0 and 100),
  spotify_link text,
  youtube_link text,
  soundcloud_link text,
  tip_link text,
  other_link_url text,
  other_link_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artists_owner_user_id_idx on public.artists(owner_user_id);
create index if not exists artists_status_idx on public.artists(status);

grant select, insert, update, delete on public.artists to authenticated;
grant select on public.artists to anon;
grant all on public.artists to service_role;

alter table public.artists enable row level security;

drop policy if exists "artists public read approved" on public.artists;
create policy "artists public read approved"
  on public.artists for select
  using (status = 'approved');

drop policy if exists "artists owner read" on public.artists;
create policy "artists owner read"
  on public.artists for select to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "artists staff read" on public.artists;
create policy "artists staff read"
  on public.artists for select to authenticated
  using (public.has_role(auth.uid(), 'staff') or public.has_role(auth.uid(), 'admin'));

drop policy if exists "artists owner insert" on public.artists;
create policy "artists owner insert"
  on public.artists for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "artists owner update" on public.artists;
create policy "artists owner update"
  on public.artists for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "artists staff write" on public.artists;
create policy "artists staff write"
  on public.artists for all to authenticated
  using (public.has_role(auth.uid(), 'staff') or public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'staff') or public.has_role(auth.uid(), 'admin'));

drop policy if exists "artists owner delete" on public.artists;
create policy "artists owner delete"
  on public.artists for delete to authenticated
  using (owner_user_id = auth.uid());

-- Slots: add artist_id; keep busker_id as legacy null-friendly column.
alter table public.slots
  add column if not exists artist_id uuid references public.artists(id) on delete set null;

create index if not exists slots_artist_id_idx on public.slots(artist_id);

-- Backfill: create one artist row per profile that has artist-ish data
-- (already approved, or has any music-specific field filled).
insert into public.artists (
  owner_user_id, full_name, email, genre, bio, avatar_url,
  avatar_focal_x, avatar_focal_y,
  spotify_link, youtube_link, soundcloud_link, tip_link,
  other_link_url, other_link_name, status, created_at, updated_at
)
select
  p.id,
  coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Unnamed artist'),
  p.email,
  p.genre,
  p.bio,
  p.avatar_url,
  coalesce(p.avatar_focal_x, 50),
  coalesce(p.avatar_focal_y, 50),
  p.spotify_link,
  p.youtube_link,
  p.soundcloud_link,
  p.tip_link,
  p.other_link_url,
  p.other_link_name,
  case when p.is_approved then 'approved' else 'pending' end,
  coalesce(p.created_at, now()),
  now()
from public.profiles p
where
  (coalesce(p.is_staff, false) = false)
  and (
    p.is_approved = true
    or coalesce(nullif(trim(p.genre), ''), '') <> ''
    or coalesce(nullif(trim(p.bio), ''), '') <> ''
    or coalesce(nullif(trim(p.spotify_link), ''), '') <> ''
    or coalesce(nullif(trim(p.youtube_link), ''), '') <> ''
    or coalesce(nullif(trim(p.soundcloud_link), ''), '') <> ''
    or coalesce(nullif(trim(p.tip_link), ''), '') <> ''
    or coalesce(nullif(trim(p.other_link_url), ''), '') <> ''
    or exists (select 1 from public.slots s where s.busker_id = p.id)
  )
  and not exists (select 1 from public.artists a where a.owner_user_id = p.id);

-- Backfill slots.artist_id from existing busker_id by matching the user's
-- (now-canonical) artist. If a user has multiple artists later, staff can
-- reassign manually.
update public.slots s
set artist_id = a.id
from public.artists a
where s.artist_id is null
  and s.busker_id is not null
  and a.owner_user_id = s.busker_id
  and a.id = (
    select a2.id from public.artists a2
    where a2.owner_user_id = s.busker_id
    order by a2.created_at asc
    limit 1
  );

-- updated_at trigger
create or replace function public.artists_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists artists_set_updated_at on public.artists;
create trigger artists_set_updated_at
  before update on public.artists
  for each row execute function public.artists_set_updated_at();
