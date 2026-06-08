-- 311 module upgrades:
--   * staff assignment (registered users + raw-email invites)
--   * multi-department assignment
--   * duplicate linking
--   * asset catalog + history
--   * labor / repair cost line items

-- ------------------------------------------------------------------
-- 1) ASSETS (catalog)
-- ------------------------------------------------------------------
do $$ begin
  create type public.asset_type as enum (
    'streetlight','sign','hydrant','bench','tree','playground',
    'sidewalk','road','park','building','other'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  asset_type public.asset_type not null default 'other',
  external_ref text,
  address text,
  latitude double precision,
  longitude double precision,
  install_date date,
  department_id uuid references public.departments(id) on delete set null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.assets to authenticated;
grant all on public.assets to service_role;

create index if not exists assets_dept_idx on public.assets(department_id);
create index if not exists assets_type_idx on public.assets(asset_type);
create index if not exists assets_loc_idx on public.assets(latitude, longitude);

drop trigger if exists assets_touch_updated_at on public.assets;
create trigger assets_touch_updated_at
  before update on public.assets
  for each row execute function public.touch_updated_at();

alter table public.assets enable row level security;

drop policy if exists "assets_staff_read" on public.assets;
create policy "assets_staff_read"
  on public.assets for select
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or department_id is null
    or public.can_read_department(auth.uid(), department_id)
  );

drop policy if exists "assets_staff_write" on public.assets;
create policy "assets_staff_write"
  on public.assets for all
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or (department_id is not null and public.can_write_department(auth.uid(), department_id))
  )
  with check (
    public.is_department_super_admin(auth.uid())
    or (department_id is not null and public.can_write_department(auth.uid(), department_id))
  );

-- Link asset onto tickets
alter table public.tickets
  add column if not exists asset_id uuid references public.assets(id) on delete set null;
create index if not exists tickets_asset_idx on public.tickets(asset_id);

-- ------------------------------------------------------------------
-- 2) MULTI-DEPARTMENT ASSIGNMENT
-- ------------------------------------------------------------------
create table if not exists public.ticket_departments (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  is_primary boolean not null default false,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (ticket_id, department_id)
);

grant select, insert, update, delete on public.ticket_departments to authenticated;
grant all on public.ticket_departments to service_role;

create index if not exists ticket_departments_dept_idx on public.ticket_departments(department_id);

-- Only one primary per ticket
create unique index if not exists ticket_departments_one_primary
  on public.ticket_departments(ticket_id) where is_primary;

alter table public.ticket_departments enable row level security;

drop policy if exists "ticket_departments_staff_read" on public.ticket_departments;
create policy "ticket_departments_staff_read"
  on public.ticket_departments for select
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or public.can_read_department(auth.uid(), department_id)
  );

drop policy if exists "ticket_departments_staff_write" on public.ticket_departments;
create policy "ticket_departments_staff_write"
  on public.ticket_departments for all
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or public.can_write_department(auth.uid(), department_id)
  )
  with check (
    public.is_department_super_admin(auth.uid())
    or public.can_write_department(auth.uid(), department_id)
  );

-- Keep legacy tickets.assigned_department_id mirroring the primary row.
create or replace function public.sync_ticket_primary_department()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ticket uuid := coalesce(new.ticket_id, old.ticket_id);
  v_primary uuid;
begin
  if tg_op = 'UPDATE' and new.is_primary and not old.is_primary then
    update public.ticket_departments
      set is_primary = false
      where ticket_id = v_ticket
        and department_id <> new.department_id
        and is_primary;
  end if;
  if tg_op = 'INSERT' and new.is_primary then
    update public.ticket_departments
      set is_primary = false
      where ticket_id = v_ticket
        and department_id <> new.department_id
        and is_primary;
  end if;

  select department_id into v_primary
    from public.ticket_departments
    where ticket_id = v_ticket and is_primary
    limit 1;

  update public.tickets
    set assigned_department_id = v_primary
    where id = v_ticket;

  return coalesce(new, old);
end;
$$;

drop trigger if exists ticket_departments_sync on public.ticket_departments;
create trigger ticket_departments_sync
  after insert or update or delete on public.ticket_departments
  for each row execute function public.sync_ticket_primary_department();

-- Backfill: copy existing tickets.assigned_department_id into ticket_departments
insert into public.ticket_departments (ticket_id, department_id, is_primary, added_by)
  select id, assigned_department_id, true, null
  from public.tickets
  where assigned_department_id is not null
on conflict do nothing;

-- Add ticket read/write policies that consult ticket_departments
drop policy if exists "tickets_staff_read_multidept" on public.tickets;
create policy "tickets_staff_read_multidept"
  on public.tickets for select
  to authenticated
  using (
    exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = tickets.id
        and public.can_read_department(auth.uid(), td.department_id)
    )
  );

drop policy if exists "tickets_staff_update_multidept" on public.tickets;
create policy "tickets_staff_update_multidept"
  on public.tickets for update
  to authenticated
  using (
    exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = tickets.id
        and public.can_write_department(auth.uid(), td.department_id)
    )
  )
  with check (
    exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = tickets.id
        and public.can_write_department(auth.uid(), td.department_id)
    )
  );

-- ------------------------------------------------------------------
-- 3) ASSIGNEES (users + raw email invites)
-- ------------------------------------------------------------------
create table if not exists public.ticket_assignees (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  staff_user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint ticket_assignees_has_target check (
    staff_user_id is not null or invited_email is not null
  )
);

grant select, insert, update, delete on public.ticket_assignees to authenticated;
grant all on public.ticket_assignees to service_role;

create unique index if not exists ticket_assignees_user_uniq
  on public.ticket_assignees(ticket_id, staff_user_id) where staff_user_id is not null;
create unique index if not exists ticket_assignees_email_uniq
  on public.ticket_assignees(ticket_id, lower(invited_email)) where invited_email is not null;
create index if not exists ticket_assignees_user_idx on public.ticket_assignees(staff_user_id);

alter table public.ticket_assignees enable row level security;

drop policy if exists "ticket_assignees_staff_read" on public.ticket_assignees;
create policy "ticket_assignees_staff_read"
  on public.ticket_assignees for select
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or staff_user_id = auth.uid()
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = ticket_assignees.ticket_id
        and public.can_read_department(auth.uid(), td.department_id)
    )
  );

drop policy if exists "ticket_assignees_staff_write" on public.ticket_assignees;
create policy "ticket_assignees_staff_write"
  on public.ticket_assignees for all
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = ticket_assignees.ticket_id
        and public.can_write_department(auth.uid(), td.department_id)
    )
  )
  with check (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = ticket_assignees.ticket_id
        and public.can_write_department(auth.uid(), td.department_id)
    )
  );

-- Auto-claim invited_email rows once that user signs up.
create or replace function public.claim_ticket_assignee_invites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    update public.ticket_assignees
      set staff_user_id = new.id,
          invited_email = null,
          accepted_at = coalesce(accepted_at, now())
      where invited_email is not null
        and lower(invited_email) = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists claim_ticket_assignee_invites_trg on auth.users;
create trigger claim_ticket_assignee_invites_trg
  after insert on auth.users
  for each row execute function public.claim_ticket_assignee_invites();

-- ------------------------------------------------------------------
-- 4) DUPLICATE LINKING
-- ------------------------------------------------------------------
create table if not exists public.ticket_duplicates (
  id uuid primary key default gen_random_uuid(),
  primary_ticket_id uuid not null references public.tickets(id) on delete cascade,
  duplicate_ticket_id uuid not null references public.tickets(id) on delete cascade,
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  constraint ticket_duplicates_not_self check (primary_ticket_id <> duplicate_ticket_id),
  unique (duplicate_ticket_id)
);

grant select, insert, update, delete on public.ticket_duplicates to authenticated;
grant all on public.ticket_duplicates to service_role;

create index if not exists ticket_duplicates_primary_idx on public.ticket_duplicates(primary_ticket_id);

alter table public.ticket_duplicates enable row level security;

drop policy if exists "ticket_duplicates_read" on public.ticket_duplicates;
create policy "ticket_duplicates_read"
  on public.ticket_duplicates for select
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id in (primary_ticket_id, duplicate_ticket_id)
        and public.can_read_department(auth.uid(), td.department_id)
    )
    or exists (
      select 1 from public.tickets t
      where t.id in (primary_ticket_id, duplicate_ticket_id)
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "ticket_duplicates_write" on public.ticket_duplicates;
create policy "ticket_duplicates_write"
  on public.ticket_duplicates for all
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id in (primary_ticket_id, duplicate_ticket_id)
        and public.can_write_department(auth.uid(), td.department_id)
    )
  )
  with check (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id in (primary_ticket_id, duplicate_ticket_id)
        and public.can_write_department(auth.uid(), td.department_id)
    )
  );

-- Mirror primary status onto its duplicates.
create or replace function public.mirror_primary_status_to_dupes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    update public.tickets t
      set status = new.status
      from public.ticket_duplicates d
      where d.primary_ticket_id = new.id
        and t.id = d.duplicate_ticket_id
        and t.status is distinct from new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_mirror_status_to_dupes on public.tickets;
create trigger tickets_mirror_status_to_dupes
  after update of status on public.tickets
  for each row execute function public.mirror_primary_status_to_dupes();

-- ------------------------------------------------------------------
-- 5) COST LINE ITEMS
-- ------------------------------------------------------------------
do $$ begin
  create type public.ticket_cost_kind as enum ('labor','materials','equipment','other');
exception when duplicate_object then null; end $$;

create table if not exists public.ticket_costs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  kind public.ticket_cost_kind not null default 'other',
  description text,
  hours numeric(8,2),
  rate numeric(10,2),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  incurred_on date not null default current_date,
  logged_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.ticket_costs to authenticated;
grant all on public.ticket_costs to service_role;

create index if not exists ticket_costs_ticket_idx on public.ticket_costs(ticket_id);

alter table public.ticket_costs enable row level security;

drop policy if exists "ticket_costs_staff_read" on public.ticket_costs;
create policy "ticket_costs_staff_read"
  on public.ticket_costs for select
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = ticket_costs.ticket_id
        and public.can_read_department(auth.uid(), td.department_id)
    )
  );

drop policy if exists "ticket_costs_staff_write" on public.ticket_costs;
create policy "ticket_costs_staff_write"
  on public.ticket_costs for all
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = ticket_costs.ticket_id
        and public.can_write_department(auth.uid(), td.department_id)
    )
  )
  with check (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.ticket_departments td
      where td.ticket_id = ticket_costs.ticket_id
        and public.can_write_department(auth.uid(), td.department_id)
    )
  );

-- ------------------------------------------------------------------
-- 6) REALTIME
-- ------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.ticket_assignees;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ticket_departments;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ticket_duplicates;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ticket_costs;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.assets;
exception when duplicate_object then null; when others then null; end $$;
