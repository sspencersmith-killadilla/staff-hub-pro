-- Granular staff permissions.
-- Global defaults + per-event grant/revoke overrides.

create table if not exists public.staff_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  unique (user_id, permission)
);

create table if not exists public.staff_event_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.sessions(id) on delete cascade,
  permission text not null,
  granted boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_id, permission)
);

create index if not exists staff_permissions_user_idx
  on public.staff_permissions(user_id);
create index if not exists staff_event_permissions_user_event_idx
  on public.staff_event_permissions(user_id, event_id);

grant select on public.staff_permissions to authenticated;
grant all on public.staff_permissions to service_role;
grant select on public.staff_event_permissions to authenticated;
grant all on public.staff_event_permissions to service_role;

alter table public.staff_permissions enable row level security;
alter table public.staff_event_permissions enable row level security;

drop policy if exists "Users read their own staff permissions"
  on public.staff_permissions;
create policy "Users read their own staff permissions"
  on public.staff_permissions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users read their own staff event permissions"
  on public.staff_event_permissions;
create policy "Users read their own staff event permissions"
  on public.staff_event_permissions for select
  to authenticated
  using (user_id = auth.uid());

-- Backfill: preserve existing behavior by granting all known permissions
-- globally to every current staff/admin user.
do $$
declare
  perm text;
  perms text[] := array[
    'page.events','page.venues','page.box_office','page.vendors',
    'page.sponsors','page.community_music','page.community_orgs',
    'page.community_events','page.room_reservations','page.settings',
    'event.reports','event.door','event.tickets','event.gigs',
    'event.floorplan','event.marketing','event.commercial','event.vendors',
    'event.sponsors','event.volunteers','event.talent'
  ];
begin
  foreach perm in array perms loop
    insert into public.staff_permissions (user_id, permission)
    select distinct ur.user_id, perm
    from public.user_roles ur
    where ur.role in ('staff','admin')
    on conflict (user_id, permission) do nothing;
  end loop;
end $$;
