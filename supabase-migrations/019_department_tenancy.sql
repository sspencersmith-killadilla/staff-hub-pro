-- Multi-tenant department schema and RLS transition.
-- Safe to re-run. Backfills existing global data into a Default Department.

do $$ begin
  create type public.department_role as enum ('super_admin', 'dept_admin', 'staff');
exception when duplicate_object then null; end $$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text,
  brand_css jsonb not null default '{}'::jsonb,
  room_policy_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.departments to anon, authenticated;
grant insert, update, delete on public.departments to authenticated;
grant all on public.departments to service_role;

create table if not exists public.department_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  role public.department_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, department_id, role)
);

grant select, insert, update, delete on public.department_roles to authenticated;
grant all on public.department_roles to service_role;

create index if not exists department_roles_user_idx on public.department_roles(user_id);
create index if not exists department_roles_department_idx on public.department_roles(department_id);

insert into public.departments (name, room_policy_text)
values ('Default Department', 'Standard room reservation policies apply.')
on conflict (name) do nothing;

alter table public.venues
  add column if not exists department_id uuid references public.departments(id) on delete restrict;

alter table public.rooms
  add column if not exists department_id uuid references public.departments(id) on delete restrict,
  add column if not exists instant_bookable boolean not null default false;

alter table public.events
  add column if not exists department_id uuid references public.departments(id) on delete restrict,
  add column if not exists staff_owner_id uuid references auth.users(id) on delete set null;

-- The app's staff-managed city events are stored in `sessions`, so mirror the
-- department ownership columns there as well as on the legacy/community `events` table.
alter table public.sessions
  add column if not exists department_id uuid references public.departments(id) on delete restrict,
  add column if not exists staff_owner_id uuid references auth.users(id) on delete set null;

create index if not exists venues_department_id_idx on public.venues(department_id);
create index if not exists rooms_department_id_idx on public.rooms(department_id);
create index if not exists events_department_id_idx on public.events(department_id);
create index if not exists events_staff_owner_id_idx on public.events(staff_owner_id);
create index if not exists sessions_department_id_idx on public.sessions(department_id);
create index if not exists sessions_staff_owner_id_idx on public.sessions(staff_owner_id);

with default_department as (
  select id from public.departments where name = 'Default Department' limit 1
)
update public.venues v
set department_id = d.id
from default_department d
where v.department_id is null;

update public.rooms r
set department_id = v.department_id
from public.venues v
where r.department_id is null
  and r.venue_id = v.id
  and v.department_id is not null;

with default_department as (
  select id from public.departments where name = 'Default Department' limit 1
)
update public.rooms r
set department_id = d.id
from default_department d
where r.department_id is null;

with default_department as (
  select id from public.departments where name = 'Default Department' limit 1
)
update public.events e
set department_id = d.id
from default_department d
where e.department_id is null;

update public.sessions s
set department_id = v.department_id
from public.stages st
join public.venues v on v.id = st.venue_id
where s.department_id is null
  and s.stage_id = st.id
  and v.department_id is not null;

update public.sessions s
set department_id = r.department_id
from public.rooms r
where s.department_id is null
  and s.room_id = r.id
  and r.department_id is not null;

with default_department as (
  select id from public.departments where name = 'Default Department' limit 1
)
update public.sessions s
set department_id = d.id
from default_department d
where s.department_id is null;

-- Preserve current global access by migrating old roles into the default tenant.
insert into public.department_roles (user_id, department_id, role)
select
  ur.user_id,
  d.id,
  case
    when ur.role::text = 'admin' then 'super_admin'::public.department_role
    else 'staff'::public.department_role
  end
from public.user_roles ur
cross join (select id from public.departments where name = 'Default Department' limit 1) d
where ur.role::text in ('admin', 'staff')
on conflict (user_id, department_id, role) do nothing;

create or replace function public.is_department_super_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(_user_id is not null and exists (
    select 1
    from public.department_roles dr
    where dr.user_id = _user_id
      and dr.role = 'super_admin'
  ), false)
$$;

create or replace function public.has_department_role(
  _user_id uuid,
  _department_id uuid,
  _roles public.department_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(_user_id is not null and _department_id is not null and exists (
    select 1
    from public.department_roles dr
    where dr.user_id = _user_id
      and dr.department_id = _department_id
      and dr.role = any(_roles)
  ), false)
$$;

create or replace function public.can_read_department(_user_id uuid, _department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_department_super_admin(_user_id)
    or public.has_department_role(
      _user_id,
      _department_id,
      array['dept_admin'::public.department_role, 'staff'::public.department_role]
    )
$$;

create or replace function public.can_write_department(_user_id uuid, _department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_department_super_admin(_user_id)
    or public.has_department_role(
      _user_id,
      _department_id,
      array['dept_admin'::public.department_role, 'staff'::public.department_role]
    )
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists departments_touch_updated_at on public.departments;
create trigger departments_touch_updated_at
  before update on public.departments
  for each row execute function public.touch_updated_at();

alter table public.departments enable row level security;
alter table public.department_roles enable row level security;
alter table public.venues enable row level security;
alter table public.rooms enable row level security;
alter table public.events enable row level security;
alter table public.sessions enable row level security;

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('departments', 'department_roles', 'venues', 'rooms', 'events', 'sessions')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end$$;

create policy "departments_public_read"
  on public.departments for select
  to anon, authenticated
  using (true);

create policy "departments_super_admin_insert"
  on public.departments for insert
  to authenticated
  with check (public.is_department_super_admin(auth.uid()));

create policy "departments_department_admin_update"
  on public.departments for update
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or public.has_department_role(auth.uid(), id, array['dept_admin'::public.department_role])
  )
  with check (
    public.is_department_super_admin(auth.uid())
    or public.has_department_role(auth.uid(), id, array['dept_admin'::public.department_role])
  );

create policy "departments_super_admin_delete"
  on public.departments for delete
  to authenticated
  using (public.is_department_super_admin(auth.uid()));

create policy "department_roles_read"
  on public.department_roles for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_department_super_admin(auth.uid())
    or public.has_department_role(auth.uid(), department_id, array['dept_admin'::public.department_role])
  );

create policy "department_roles_insert"
  on public.department_roles for insert
  to authenticated
  with check (
    public.is_department_super_admin(auth.uid())
    or (
      role <> 'super_admin'
      and public.has_department_role(auth.uid(), department_id, array['dept_admin'::public.department_role])
    )
  );

create policy "department_roles_update"
  on public.department_roles for update
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or (
      role <> 'super_admin'
      and public.has_department_role(auth.uid(), department_id, array['dept_admin'::public.department_role])
    )
  )
  with check (
    public.is_department_super_admin(auth.uid())
    or (
      role <> 'super_admin'
      and public.has_department_role(auth.uid(), department_id, array['dept_admin'::public.department_role])
    )
  );

create policy "department_roles_delete"
  on public.department_roles for delete
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or (
      role <> 'super_admin'
      and public.has_department_role(auth.uid(), department_id, array['dept_admin'::public.department_role])
    )
  );

create policy "venues_public_read"
  on public.venues for select
  to anon, authenticated
  using (true);

create policy "venues_department_insert"
  on public.venues for insert
  to authenticated
  with check (public.can_write_department(auth.uid(), department_id));

create policy "venues_department_update"
  on public.venues for update
  to authenticated
  using (public.can_write_department(auth.uid(), department_id))
  with check (public.can_write_department(auth.uid(), department_id));

create policy "venues_department_delete"
  on public.venues for delete
  to authenticated
  using (public.can_write_department(auth.uid(), department_id));

create policy "rooms_public_bookable_read"
  on public.rooms for select
  to anon, authenticated
  using (coalesce(is_publicly_bookable, false));

create policy "rooms_department_staff_read"
  on public.rooms for select
  to authenticated
  using (public.can_read_department(auth.uid(), department_id));

create policy "rooms_department_insert"
  on public.rooms for insert
  to authenticated
  with check (public.can_write_department(auth.uid(), department_id));

create policy "rooms_department_update"
  on public.rooms for update
  to authenticated
  using (public.can_write_department(auth.uid(), department_id))
  with check (public.can_write_department(auth.uid(), department_id));

create policy "rooms_department_delete"
  on public.rooms for delete
  to authenticated
  using (public.can_write_department(auth.uid(), department_id));

create policy "events_public_active_read"
  on public.events for select
  to anon, authenticated
  using (
    coalesce(approval_status, 'approved') = 'approved'
    and (end_time is null or end_time >= now())
  );

create policy "events_department_staff_read"
  on public.events for select
  to authenticated
  using (public.can_read_department(auth.uid(), department_id));

create policy "events_department_insert"
  on public.events for insert
  to authenticated
  with check (public.can_write_department(auth.uid(), department_id));

create policy "events_department_update"
  on public.events for update
  to authenticated
  using (public.can_write_department(auth.uid(), department_id))
  with check (public.can_write_department(auth.uid(), department_id));

create policy "events_department_delete"
  on public.events for delete
  to authenticated
  using (public.can_write_department(auth.uid(), department_id));

create policy "sessions_public_active_read"
  on public.sessions for select
  to anon, authenticated
  using (end_time is null or end_time >= now());

create policy "sessions_department_staff_read"
  on public.sessions for select
  to authenticated
  using (public.can_read_department(auth.uid(), department_id));

create policy "sessions_department_insert"
  on public.sessions for insert
  to authenticated
  with check (public.can_write_department(auth.uid(), department_id));

create policy "sessions_department_update"
  on public.sessions for update
  to authenticated
  using (public.can_write_department(auth.uid(), department_id))
  with check (public.can_write_department(auth.uid(), department_id));

create policy "sessions_department_delete"
  on public.sessions for delete
  to authenticated
  using (public.can_write_department(auth.uid(), department_id));