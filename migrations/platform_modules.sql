-- Platform module toggles
create table if not exists public.platform_modules (
  key text primary key,
  label text not null,
  description text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.platform_modules enable row level security;

-- Anyone authenticated can read module flags (UI needs them)
drop policy if exists "platform_modules read" on public.platform_modules;
create policy "platform_modules read"
  on public.platform_modules for select
  to authenticated
  using (true);

-- Only admins can modify
drop policy if exists "platform_modules admin write" on public.platform_modules;
create policy "platform_modules admin write"
  on public.platform_modules for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Seed defaults
insert into public.platform_modules (key, label, description, enabled) values
  ('community_orgs', 'Community Organizations Portal', 'Allows HOAs, nonprofits, and schools to submit public events.', true),
  ('room_reservations', 'Public Room Reservations', 'Allows residents to book conference rooms and study pods.', true),
  ('streetbeats', 'StreetBeats Music Portal', 'Allows musicians to audition and claim public busking slots.', true),
  ('vendors_sponsors', 'Vendors & Sponsors Portal', 'Allows businesses to apply for booths and sponsorship packages.', true)
on conflict (key) do nothing;
