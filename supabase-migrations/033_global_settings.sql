-- Global white-label branding settings (single row).

create table if not exists public.global_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  city_name text not null default 'Our City',
  primary_logo_url text,
  favicon_url text,
  primary_color text not null default '#2563eb',
  secondary_color text not null default '#64748b',
  font_family text not null default 'Inter',
  updated_at timestamptz not null default now(),
  constraint global_settings_singleton_unique unique (singleton),
  constraint global_settings_singleton_true check (singleton = true)
);

grant select on public.global_settings to anon, authenticated;
grant all on public.global_settings to service_role;

alter table public.global_settings enable row level security;

drop policy if exists "Global settings readable by all" on public.global_settings;
create policy "Global settings readable by all"
  on public.global_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can update global settings" on public.global_settings;
create policy "Admins can update global settings"
  on public.global_settings for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can insert global settings" on public.global_settings;
create policy "Admins can insert global settings"
  on public.global_settings for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

-- Seed exactly one row
insert into public.global_settings (singleton, city_name)
values (true, 'Our City')
on conflict (singleton) do nothing;

-- Public branding storage bucket
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "Branding assets are publicly readable" on storage.objects;
create policy "Branding assets are publicly readable"
  on storage.objects for select
  using (bucket_id = 'branding');

drop policy if exists "Admins can upload branding" on storage.objects;
create policy "Admins can upload branding"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'branding' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can update branding" on storage.objects;
create policy "Admins can update branding"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'branding' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can delete branding" on storage.objects;
create policy "Admins can delete branding"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'branding' and public.has_role(auth.uid(), 'admin'));
