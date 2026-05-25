-- ============================================================
-- Community Organizations + Community Events
-- Run this in the Lovable Cloud SQL editor.
-- ============================================================

-- ---------- Orgs ----------
create table if not exists public.community_organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  org_type text,
  contact_email text not null,
  contact_phone text,
  website text,
  description text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
alter table public.community_organizations enable row level security;

drop policy if exists "co_self_select" on public.community_organizations;
create policy "co_self_select" on public.community_organizations
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "co_self_insert" on public.community_organizations;
create policy "co_self_insert" on public.community_organizations
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "co_self_update" on public.community_organizations;
create policy "co_self_update" on public.community_organizations
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Org-submitted locations ----------
create table if not exists public.community_event_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.community_organizations(id) on delete cascade,
  name text not null,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.community_event_locations enable row level security;

drop policy if exists "cel_owner_all" on public.community_event_locations;
create policy "cel_owner_all" on public.community_event_locations
  for all to authenticated
  using (exists (
    select 1 from public.community_organizations o
    where o.id = community_event_locations.org_id and o.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.community_organizations o
    where o.id = community_event_locations.org_id and o.user_id = auth.uid()
  ));

-- ---------- Community events ----------
create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.community_organizations(id) on delete cascade,
  location_id uuid references public.community_event_locations(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cost_text text,
  contact_info text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.community_events enable row level security;

drop policy if exists "ce_owner_all" on public.community_events;
create policy "ce_owner_all" on public.community_events
  for all to authenticated
  using (exists (
    select 1 from public.community_organizations o
    where o.id = community_events.org_id and o.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.community_organizations o
    where o.id = community_events.org_id and o.user_id = auth.uid()
  ));

-- ---------- Updated-at trigger (reuse existing fn if present) ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_co_touch on public.community_organizations;
create trigger trg_co_touch before update on public.community_organizations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_cel_touch on public.community_event_locations;
create trigger trg_cel_touch before update on public.community_event_locations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ce_touch on public.community_events;
create trigger trg_ce_touch before update on public.community_events
  for each row execute function public.touch_updated_at();
