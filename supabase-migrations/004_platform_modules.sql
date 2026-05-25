-- Platform module toggles, admin-controlled
create table if not exists public.platform_modules (
  key text primary key,
  label text not null,
  description text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.platform_modules enable row level security;

drop policy if exists "platform_modules read all" on public.platform_modules;
create policy "platform_modules read all"
  on public.platform_modules for select
  to anon, authenticated
  using (true);

drop policy if exists "platform_modules admin update" on public.platform_modules;
create policy "platform_modules admin update"
  on public.platform_modules for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.platform_modules (key, label, description) values
  ('vendors_sponsors', 'Vendors & Sponsors Portal', 'Allows businesses to apply for booths and sponsorship packages.'),
  ('streetbeats', 'StreetBeats Music Portal', 'Allows musicians to audition and claim public busking slots.'),
  ('community_orgs', 'Community Organizations Portal', 'Allows HOAs, nonprofits, and schools to submit public events.'),
  ('room_reservations', 'Public Room Reservations', 'Allows residents to book conference rooms and study pods.')
on conflict (key) do nothing;
