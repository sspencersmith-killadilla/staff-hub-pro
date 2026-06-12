-- WorkPlanOS integration: settings, event refs, dispatch log.

-- ---------- workplanos_integration ----------
create table if not exists public.workplanos_integration (
  org_id uuid primary key references public.community_organizations(id) on delete cascade,
  wpo_base_url text not null default 'https://workplanos.lovable.app',
  wpo_workspace_id text,
  shared_secret text,
  shared_secret_hash text,
  enabled boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.workplanos_integration to authenticated;
grant all on public.workplanos_integration to service_role;

alter table public.workplanos_integration enable row level security;

drop policy if exists wpo_int_owner_select on public.workplanos_integration;
create policy wpo_int_owner_select on public.workplanos_integration
  for select to authenticated using (
    exists (
      select 1 from public.community_organizations o
      where o.id = workplanos_integration.org_id and o.user_id = auth.uid()
    )
  );

drop policy if exists wpo_int_owner_write on public.workplanos_integration;
create policy wpo_int_owner_write on public.workplanos_integration
  for all to authenticated using (
    exists (
      select 1 from public.community_organizations o
      where o.id = workplanos_integration.org_id and o.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.community_organizations o
      where o.id = workplanos_integration.org_id and o.user_id = auth.uid()
    )
  );

-- ---------- event_external_refs ----------
create table if not exists public.event_external_refs (
  event_id uuid primary key references public.events(id) on delete cascade,
  source text not null default 'wpo',
  external_item_id text not null,
  external_url text,
  updated_at timestamptz not null default now(),
  unique (source, external_item_id)
);

grant select, insert, update, delete on public.event_external_refs to authenticated;
grant all on public.event_external_refs to service_role;

alter table public.event_external_refs enable row level security;

drop policy if exists eer_owner_all on public.event_external_refs;
create policy eer_owner_all on public.event_external_refs
  for all to authenticated using (
    exists (
      select 1 from public.events e
      join public.community_organizations o on o.id = e.organization_id
      where e.id = event_external_refs.event_id and o.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.events e
      join public.community_organizations o on o.id = e.organization_id
      where e.id = event_external_refs.event_id and o.user_id = auth.uid()
    )
  );

-- ---------- integration_dispatches ----------
create table if not exists public.integration_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.community_organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  payload jsonb,
  status_code int,
  error text,
  attempts int not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_dispatches_org_created
  on public.integration_dispatches(org_id, created_at desc);

grant select on public.integration_dispatches to authenticated;
grant all on public.integration_dispatches to service_role;

alter table public.integration_dispatches enable row level security;

drop policy if exists id_owner_select on public.integration_dispatches;
create policy id_owner_select on public.integration_dispatches
  for select to authenticated using (
    exists (
      select 1 from public.community_organizations o
      where o.id = integration_dispatches.org_id and o.user_id = auth.uid()
    )
  );
