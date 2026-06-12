-- Re-scope WorkPlanOS integration from per-tenant to per-department.
-- Safe to drop existing rows: feature was unreleased.

-- ---------- workplanos_integration ----------
drop policy if exists wpo_int_staff_select on public.workplanos_integration;
drop policy if exists wpo_int_staff_write on public.workplanos_integration;

truncate table public.workplanos_integration;

alter table public.workplanos_integration
  drop constraint if exists workplanos_integration_pkey;
alter table public.workplanos_integration
  drop constraint if exists workplanos_integration_tenant_id_fkey;

alter table public.workplanos_integration
  rename column tenant_id to department_id;

alter table public.workplanos_integration
  add constraint workplanos_integration_pkey primary key (department_id),
  add constraint workplanos_integration_department_id_fkey
    foreign key (department_id) references public.departments(id) on delete cascade;

-- ---------- integration_dispatches ----------
drop policy if exists id_staff_select on public.integration_dispatches;
drop index if exists idx_integration_dispatches_tenant_created;

truncate table public.integration_dispatches;

alter table public.integration_dispatches
  drop constraint if exists integration_dispatches_tenant_id_fkey;

alter table public.integration_dispatches
  rename column tenant_id to department_id;

alter table public.integration_dispatches
  add constraint integration_dispatches_department_id_fkey
    foreign key (department_id) references public.departments(id) on delete cascade;

create index if not exists idx_integration_dispatches_department_created
  on public.integration_dispatches(department_id, created_at desc);

-- ---------- can_manage_wpo helper ----------
-- Drop the old (uuid) signature, then create the new one taking a department.
drop function if exists public.can_manage_wpo(uuid);

create or replace function public.can_manage_wpo(_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
    or exists (
      select 1 from public.department_roles
      where user_id = auth.uid()
        and department_id = _department_id
        and role in ('super_admin', 'dept_admin')
    )
$$;

-- ---------- Policies ----------
create policy wpo_int_staff_select on public.workplanos_integration
  for select to authenticated
  using (public.can_manage_wpo(department_id));

create policy wpo_int_staff_write on public.workplanos_integration
  for all to authenticated
  using (public.can_manage_wpo(department_id))
  with check (public.can_manage_wpo(department_id));

create policy id_staff_select on public.integration_dispatches
  for select to authenticated
  using (public.can_manage_wpo(department_id));

-- ---------- Grants ----------
grant select, insert, update, delete on public.workplanos_integration to authenticated;
grant all on public.workplanos_integration to service_role;
grant select on public.integration_dispatches to authenticated;
grant all on public.integration_dispatches to service_role;
