-- ─── Special Event Permits ───────────────────────────────────────────
-- Dynamic fee configuration + per-applicant permit submissions.

-- Category enum (event types, trail/route fees, base fees)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'permit_config_category') then
    create type public.permit_config_category as enum ('event_type', 'trail_fee', 'base_fee');
  end if;
end$$;

-- Status enum for permit submissions
do $$
begin
  if not exists (select 1 from pg_type where typname = 'special_event_permit_status') then
    create type public.special_event_permit_status as enum ('draft', 'pending_review', 'approved', 'paid', 'rejected');
  end if;
end$$;

-- ─── permit_configurations ────────────────────────────────────────────
create table if not exists public.permit_configurations (
  id uuid primary key default gen_random_uuid(),
  category public.permit_config_category not null,
  label text not null,
  cost numeric(10, 2) not null default 0,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.permit_configurations to anon, authenticated;
grant select, insert, update, delete on public.permit_configurations to authenticated;
grant all on public.permit_configurations to service_role;

alter table public.permit_configurations enable row level security;

drop policy if exists "permit_configurations public read" on public.permit_configurations;
create policy "permit_configurations public read"
  on public.permit_configurations for select
  using (true);

drop policy if exists "permit_configurations admin write" on public.permit_configurations;
create policy "permit_configurations admin write"
  on public.permit_configurations for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ─── special_event_permits ────────────────────────────────────────────
create table if not exists public.special_event_permits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  status public.special_event_permit_status not null default 'draft',
  applicant_info jsonb not null default '{}'::jsonb,
  event_details jsonb not null default '{}'::jsonb,
  operations_safety jsonb not null default '{}'::jsonb,
  insurance_docs jsonb not null default '{}'::jsonb,
  selected_event_type_id uuid references public.permit_configurations(id) on delete set null,
  selected_trail_fee_id uuid references public.permit_configurations(id) on delete set null,
  calculated_fee numeric(10, 2) not null default 0,
  signature_name text,
  signed_at timestamptz,
  payment_ref text,
  paid_at timestamptz,
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists special_event_permits_user_idx on public.special_event_permits(user_id);
create index if not exists special_event_permits_status_idx on public.special_event_permits(status);

grant select, insert, update, delete on public.special_event_permits to authenticated;
grant all on public.special_event_permits to service_role;

alter table public.special_event_permits enable row level security;

drop policy if exists "permits owner select" on public.special_event_permits;
create policy "permits owner select"
  on public.special_event_permits for select
  to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

drop policy if exists "permits owner insert" on public.special_event_permits;
create policy "permits owner insert"
  on public.special_event_permits for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "permits owner update" on public.special_event_permits;
create policy "permits owner update"
  on public.special_event_permits for update
  to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

drop policy if exists "permits admin delete" on public.special_event_permits;
create policy "permits admin delete"
  on public.special_event_permits for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ─── updated_at trigger ───────────────────────────────────────────────
create or replace function public.touch_permit_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists permit_configurations_touch on public.permit_configurations;
create trigger permit_configurations_touch
  before update on public.permit_configurations
  for each row execute function public.touch_permit_updated_at();

drop trigger if exists special_event_permits_touch on public.special_event_permits;
create trigger special_event_permits_touch
  before update on public.special_event_permits
  for each row execute function public.touch_permit_updated_at();

-- ─── Seed data ────────────────────────────────────────────────────────
insert into public.permit_configurations (category, label, cost, sort_order, is_active) values
  ('base_fee',   'Standard Application Base Fee', 100, 0,  true),
  ('event_type', 'Festival / Block Party',         0, 10, true),
  ('event_type', 'Run / Walk / Race',              0, 20, true),
  ('event_type', 'Parade',                         0, 30, true),
  ('event_type', 'Concert / Performance',          0, 40, true),
  ('event_type', 'Community Gathering',            0, 50, true),
  ('trail_fee',  'No Trail / Route Use',           0, 0,  true),
  ('trail_fee',  '5K Route',                     500, 10, true),
  ('trail_fee',  '10K Route',                    800, 20, true),
  ('trail_fee',  'Half Marathon Route',         1200, 30, true),
  ('trail_fee',  'Downtown Loop',                300, 40, true)
on conflict do nothing;

-- ─── Storage bucket: permit-docs (public read, owner write) ───────────
insert into storage.buckets (id, name, public)
values ('permit-docs', 'permit-docs', true)
on conflict (id) do update set public = true;

drop policy if exists "permit-docs public read" on storage.objects;
create policy "permit-docs public read"
  on storage.objects for select
  using (bucket_id = 'permit-docs');

drop policy if exists "permit-docs owner insert" on storage.objects;
create policy "permit-docs owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'permit-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "permit-docs owner update" on storage.objects;
create policy "permit-docs owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'permit-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "permit-docs owner delete" on storage.objects;
create policy "permit-docs owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'permit-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
