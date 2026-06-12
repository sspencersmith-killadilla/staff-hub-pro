-- Re-scope WorkPlanOS integration to per-department.
-- Handles starting state from either 057 (org_id) or 058 (tenant_id).
-- Safe to drop existing rows: feature was unreleased.

-- ---------- Drop old policies (any naming) ----------
drop policy if exists wpo_int_owner_select on public.workplanos_integration;
drop policy if exists wpo_int_owner_write on public.workplanos_integration;
drop policy if exists wpo_int_staff_select on public.workplanos_integration;
drop policy if exists wpo_int_staff_write on public.workplanos_integration;
drop policy if exists id_owner_select on public.integration_dispatches;
drop policy if exists id_staff_select on public.integration_dispatches;

drop index if exists idx_integration_dispatches_org_created;
drop index if exists idx_integration_dispatches_tenant_created;

truncate table public.workplanos_integration;
truncate table public.integration_dispatches;

-- ---------- workplanos_integration: ensure department_id column ----------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='workplanos_integration' and column_name='tenant_id'
  ) then
    alter table public.workplanos_integration drop constraint if exists workplanos_integration_pkey;
    alter table public.workplanos_integration drop constraint if exists workplanos_integration_tenant_id_fkey;
    alter table public.workplanos_integration rename column tenant_id to department_id;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='workplanos_integration' and column_name='org_id'
  ) then
    alter table public.workplanos_integration drop constraint if exists workplanos_integration_pkey;
    alter table public.workplanos_integration drop constraint if exists workplanos_integration_org_id_fkey;
    alter table public.workplanos_integration rename column org_id to department_id;
  end if;
end $$;

alter table public.workplanos_integration
  alter column department_id type uuid using department_id::uuid;

alter table public.workplanos_integration
  drop constraint if exists workplanos_integration_department_id_fkey;
alter table public.workplanos_integration
  drop constraint if exists workplanos_integration_pkey;

alter table public.workplanos_integration
  add constraint workplanos_integration_pkey primary key (department_id),
  add constraint workplanos_integration_department_id_fkey
    foreign key (department_id) references public.departments(id) on delete cascade;

-- ---------- integration_dispatches: ensure department_id column ----------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='integration_dispatches' and column_name='tenant_id'
  ) then
    alter table public.integration_dispatches drop constraint if exists integration_dispatches_tenant_id_fkey;
    alter table public.integration_dispatches rename column tenant_id to department_id;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='integration_dispatches' and column_name='org_id'
  ) then
    alter table public.integration_dispatches drop constraint if exists integration_dispatches_org_id_fkey;
    alter table public.integration_dispatches rename column org_id to department_id;
  end if;
end $$;

alter table public.integration_dispatches
  alter column department_id type uuid using department_id::uuid;

alter table public.integration_dispatches
  drop constraint if exists integration_dispatches_department_id_fkey;
alter table public.integration_dispatches
  add constraint integration_dispatches_department_id_fkey
    foreign key (department_id) references public.departments(id) on delete cascade;

create index if not exists idx_integration_dispatches_department_created
  on public.integration_dispatches(department_id, created_at desc);

-- ---------- can_manage_wpo helper ----------
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
