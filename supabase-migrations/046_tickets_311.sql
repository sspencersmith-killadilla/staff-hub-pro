-- 311 Non-Emergency Issue Reporting module.
-- Citizens submit tickets; tickets auto-route to a department based on category;
-- staff update status and notes via ticket_updates (trigger propagates status).

-- 1) Enum -------------------------------------------------------------------
do $$ begin
  create type public.ticket_status as enum ('submitted', 'received', 'in_progress', 'resolved');
exception when duplicate_object then null; end $$;

-- 2) Categories -------------------------------------------------------------
create table if not exists public.issue_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  default_department_id uuid references public.departments(id) on delete set null,
  icon text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

grant select on public.issue_categories to anon, authenticated;
grant insert, update, delete on public.issue_categories to authenticated;
grant all on public.issue_categories to service_role;

alter table public.issue_categories enable row level security;

drop policy if exists "issue_categories_public_read" on public.issue_categories;
create policy "issue_categories_public_read"
  on public.issue_categories for select
  to anon, authenticated
  using (active);

drop policy if exists "issue_categories_admin_write" on public.issue_categories;
create policy "issue_categories_admin_write"
  on public.issue_categories for all
  to authenticated
  using (public.is_department_super_admin(auth.uid()))
  with check (public.is_department_super_admin(auth.uid()));

-- Seed common categories (idempotent)
insert into public.issue_categories (name, description, icon, sort_order) values
  ('Pothole', 'Street potholes and pavement damage', 'construction', 10),
  ('Graffiti', 'Graffiti or vandalism on public property', 'spray-can', 20),
  ('Park Maintenance', 'Trash, broken equipment, or maintenance issues in city parks', 'trees', 30),
  ('Streetlight Out', 'Streetlight is not working', 'lamp-ceiling', 40),
  ('Illegal Dumping', 'Trash, debris, or other items dumped illegally', 'trash-2', 50),
  ('Sidewalk Damage', 'Cracked, raised, or missing sidewalk sections', 'footprints', 60),
  ('Tree / Brush', 'Fallen tree, low branches, or overgrowth in right-of-way', 'tree-pine', 70),
  ('Other', 'Anything else that needs the city''s attention', 'message-circle-question', 999)
on conflict (name) do nothing;

-- 3) Tickets ---------------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.issue_categories(id) on delete restrict,
  description text not null,
  location_address text,
  latitude double precision,
  longitude double precision,
  photo_url text not null,
  status public.ticket_status not null default 'submitted',
  assigned_department_id uuid references public.departments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.tickets to authenticated;
grant all on public.tickets to service_role;

create index if not exists tickets_user_idx on public.tickets(user_id);
create index if not exists tickets_dept_idx on public.tickets(assigned_department_id);
create index if not exists tickets_status_idx on public.tickets(status);
create index if not exists tickets_created_idx on public.tickets(created_at desc);

-- Auto-route to category's default department when missing
create or replace function public.set_assigned_department_from_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_department_id is null then
    select default_department_id into new.assigned_department_id
    from public.issue_categories where id = new.category_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_autoroute on public.tickets;
create trigger tickets_autoroute
  before insert on public.tickets
  for each row execute function public.set_assigned_department_from_category();

drop trigger if exists tickets_touch_updated_at on public.tickets;
create trigger tickets_touch_updated_at
  before update on public.tickets
  for each row execute function public.touch_updated_at();

alter table public.tickets enable row level security;

drop policy if exists "tickets_owner_read" on public.tickets;
create policy "tickets_owner_read"
  on public.tickets for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "tickets_owner_insert" on public.tickets;
create policy "tickets_owner_insert"
  on public.tickets for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "tickets_staff_read" on public.tickets;
create policy "tickets_staff_read"
  on public.tickets for select
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or (assigned_department_id is not null
        and public.can_read_department(auth.uid(), assigned_department_id))
  );

drop policy if exists "tickets_staff_update" on public.tickets;
create policy "tickets_staff_update"
  on public.tickets for update
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or (assigned_department_id is not null
        and public.can_write_department(auth.uid(), assigned_department_id))
  )
  with check (
    public.is_department_super_admin(auth.uid())
    or (assigned_department_id is not null
        and public.can_write_department(auth.uid(), assigned_department_id))
  );

-- 4) Ticket updates --------------------------------------------------------
create table if not exists public.ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  staff_id uuid references auth.users(id) on delete set null,
  status_change public.ticket_status,
  public_note text,
  internal_note text,
  created_at timestamptz not null default now()
);

grant select, insert on public.ticket_updates to authenticated;
grant all on public.ticket_updates to service_role;

create index if not exists ticket_updates_ticket_idx on public.ticket_updates(ticket_id, created_at);

create or replace function public.propagate_ticket_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status_change is not null then
    update public.tickets
      set status = new.status_change
      where id = new.ticket_id;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_updates_propagate on public.ticket_updates;
create trigger ticket_updates_propagate
  after insert on public.ticket_updates
  for each row execute function public.propagate_ticket_status_change();

alter table public.ticket_updates enable row level security;

-- Citizens may only read public notes for tickets they own (internal_note hidden via view)
drop policy if exists "ticket_updates_staff_read" on public.ticket_updates;
create policy "ticket_updates_staff_read"
  on public.ticket_updates for select
  to authenticated
  using (
    public.is_department_super_admin(auth.uid())
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and t.assigned_department_id is not null
        and public.can_read_department(auth.uid(), t.assigned_department_id)
    )
  );

drop policy if exists "ticket_updates_owner_public_read" on public.ticket_updates;
create policy "ticket_updates_owner_public_read"
  on public.ticket_updates for select
  to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "ticket_updates_staff_insert" on public.ticket_updates;
create policy "ticket_updates_staff_insert"
  on public.ticket_updates for insert
  to authenticated
  with check (
    staff_id = auth.uid()
    and (
      public.is_department_super_admin(auth.uid())
      or exists (
        select 1 from public.tickets t
        where t.id = ticket_id
          and t.assigned_department_id is not null
          and public.can_write_department(auth.uid(), t.assigned_department_id)
      )
    )
  );

-- Public view that excludes internal_note (citizens read via this view)
create or replace view public.ticket_updates_public
  with (security_invoker = on) as
  select id, ticket_id, staff_id, status_change, public_note, created_at
  from public.ticket_updates;

grant select on public.ticket_updates_public to authenticated;

-- 5) Realtime --------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.ticket_updates;
exception when duplicate_object then null; when others then null; end $$;

-- 6) Storage policies for ticket-photos bucket -----------------------------
-- Bucket is created out-of-band via Storage API (public=true).
do $$ begin
  drop policy if exists "ticket_photos_public_read" on storage.objects;
  create policy "ticket_photos_public_read"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'ticket-photos');

  drop policy if exists "ticket_photos_auth_insert" on storage.objects;
  create policy "ticket_photos_auth_insert"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'ticket-photos');
end $$;
