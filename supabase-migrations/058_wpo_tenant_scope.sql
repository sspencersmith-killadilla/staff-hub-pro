-- Re-scope WorkPlanOS integration from per-org to per-tenant.
-- Safe to drop existing rows: feature was unreleased.

-- ---------- workplanos_integration ----------
drop policy if exists wpo_int_owner_select on public.workplanos_integration;
drop policy if exists wpo_int_owner_write on public.workplanos_integration;

-- Drop dependent rows since FK + PK is changing.
truncate table public.workplanos_integration;

alter table public.workplanos_integration
  drop constraint if exists workplanos_integration_pkey;
alter table public.workplanos_integration
  drop constraint if exists workplanos_integration_org_id_fkey;

alter table public.workplanos_integration
  rename column org_id to tenant_id;

alter table public.workplanos_integration
  add constraint workplanos_integration_pkey primary key (tenant_id),
  add constraint workplanos_integration_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade;

drop policy if exists wpo_int_staff_select on public.workplanos_integration;
create policy wpo_int_staff_select on public.workplanos_integration
  for select to authenticated using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'dept_admin')
  );

drop policy if exists wpo_int_staff_write on public.workplanos_integration;
create policy wpo_int_staff_write on public.workplanos_integration
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'dept_admin')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'dept_admin')
  );

-- ---------- integration_dispatches ----------
drop policy if exists id_owner_select on public.integration_dispatches;
drop index if exists idx_integration_dispatches_org_created;

truncate table public.integration_dispatches;

alter table public.integration_dispatches
  drop constraint if exists integration_dispatches_org_id_fkey;

alter table public.integration_dispatches
  rename column org_id to tenant_id;

alter table public.integration_dispatches
  add constraint integration_dispatches_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade;

create index if not exists idx_integration_dispatches_tenant_created
  on public.integration_dispatches(tenant_id, created_at desc);

drop policy if exists id_staff_select on public.integration_dispatches;
create policy id_staff_select on public.integration_dispatches
  for select to authenticated using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'dept_admin')
  );

-- Re-confirm grants.
grant select, insert, update, delete on public.workplanos_integration to authenticated;
grant all on public.workplanos_integration to service_role;
grant select on public.integration_dispatches to authenticated;
grant all on public.integration_dispatches to service_role;
