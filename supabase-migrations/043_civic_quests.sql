-- 043_civic_quests.sql — Civic Quests & Discovery + leaderboard groundwork.

-- Enum for waypoint completion type.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'quest_completion_type') then
    create type public.quest_completion_type as enum (
      'qr_scan', 'geo_location', 'honor_system_button'
    );
  end if;
end$$;

-- Quests
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  description text,
  badge_image_url text,
  is_active boolean not null default false,
  points_reward integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.quests to anon, authenticated;
grant all on public.quests to service_role;

alter table public.quests enable row level security;

drop policy if exists "quests_public_select_active" on public.quests;
create policy "quests_public_select_active" on public.quests
  for select to anon, authenticated
  using (is_active = true or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

drop policy if exists "quests_admin_write" on public.quests;
create policy "quests_admin_write" on public.quests
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Waypoints
create table if not exists public.quest_waypoints (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  title text not null,
  description text,
  completion_type public.quest_completion_type not null,
  secret_code text,
  lat numeric,
  lng numeric,
  radius_m integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_quest_waypoints_quest on public.quest_waypoints(quest_id, sort_order);

grant select (id, quest_id, title, description, completion_type, lat, lng, radius_m, sort_order, created_at)
  on public.quest_waypoints to anon, authenticated;
grant all on public.quest_waypoints to service_role;

alter table public.quest_waypoints enable row level security;

drop policy if exists "waypoints_public_select" on public.quest_waypoints;
create policy "waypoints_public_select" on public.quest_waypoints
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.quests q
      where q.id = quest_waypoints.quest_id
        and (q.is_active = true or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'))
    )
  );

drop policy if exists "waypoints_admin_write" on public.quest_waypoints;
create policy "waypoints_admin_write" on public.quest_waypoints
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- User progress
create table if not exists public.user_quest_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  completed_waypoints jsonb not null default '[]'::jsonb,
  is_completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, quest_id)
);

create index if not exists idx_uqp_user on public.user_quest_progress(user_id);

grant select, insert, update on public.user_quest_progress to authenticated;
grant all on public.user_quest_progress to service_role;

alter table public.user_quest_progress enable row level security;

drop policy if exists "uqp_self_select" on public.user_quest_progress;
create policy "uqp_self_select" on public.user_quest_progress
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "uqp_self_insert" on public.user_quest_progress;
create policy "uqp_self_insert" on public.user_quest_progress
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "uqp_self_update" on public.user_quest_progress;
create policy "uqp_self_update" on public.user_quest_progress
  for update to authenticated using (user_id = auth.uid());

-- Points column on profiles (for future leaderboard).
alter table public.profiles
  add column if not exists points integer not null default 0;
