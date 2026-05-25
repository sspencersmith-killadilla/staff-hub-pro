-- Streetbeats: open busking gigs that approved artists can claim.
-- Run this once via the SQL editor in Lovable Cloud / Supabase.

-- 1. Artist profiles --------------------------------------------------------
create table if not exists public.streetbeats_artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stage_name text not null,
  contact_email text not null,
  phone text,
  genre text,
  bio text,
  website text,
  social_links jsonb default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists idx_sb_artists_status on public.streetbeats_artists(status);

alter table public.streetbeats_artists enable row level security;

drop policy if exists "sb_artists_self_read" on public.streetbeats_artists;
create policy "sb_artists_self_read" on public.streetbeats_artists
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "sb_artists_self_insert" on public.streetbeats_artists;
create policy "sb_artists_self_insert" on public.streetbeats_artists
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "sb_artists_self_update" on public.streetbeats_artists;
create policy "sb_artists_self_update" on public.streetbeats_artists
  for update to authenticated using (user_id = auth.uid());

-- Staff-side reads/writes go through server functions with service role,
-- so no extra policies needed for staff.

-- 2. Gigs -------------------------------------------------------------------
create table if not exists public.streetbeats_gigs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  venue_id integer references public.venues(id) on delete set null,
  stage_id uuid references public.stages(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  location_label text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','claimed','cancelled','completed')),
  claimed_by_artist_id uuid references public.streetbeats_artists(id) on delete set null,
  claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_sb_gigs_starts_at on public.streetbeats_gigs(starts_at);
create index if not exists idx_sb_gigs_status on public.streetbeats_gigs(status);
create index if not exists idx_sb_gigs_claimed_by on public.streetbeats_gigs(claimed_by_artist_id);

alter table public.streetbeats_gigs enable row level security;

-- Gigs are public information (anyone can see the busking schedule).
drop policy if exists "sb_gigs_public_read" on public.streetbeats_gigs;
create policy "sb_gigs_public_read" on public.streetbeats_gigs
  for select to anon, authenticated using (true);

-- All writes / claims go through server functions using the service role.

-- 3. updated_at trigger -----------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sb_artists_touch on public.streetbeats_artists;
create trigger trg_sb_artists_touch before update on public.streetbeats_artists
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_sb_gigs_touch on public.streetbeats_gigs;
create trigger trg_sb_gigs_touch before update on public.streetbeats_gigs
  for each row execute function public.touch_updated_at();
