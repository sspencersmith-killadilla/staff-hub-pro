-- Branding engine v2: full token set, tenants, presets, versioning, drafts.

-- 1. Extend global_settings (additive; all nullable so old code keeps working)
alter table public.global_settings
  add column if not exists accent_color text,
  add column if not exists background_color text,
  add column if not exists foreground_color text,
  add column if not exists muted_color text,
  add column if not exists destructive_color text,
  add column if not exists dark_primary_color text,
  add column if not exists dark_background_color text,
  add column if not exists dark_foreground_color text,
  add column if not exists dark_accent_color text,
  add column if not exists radius text default '0.625rem',
  add column if not exists heading_font text,
  add column if not exists body_font text,
  add column if not exists logo_light_url text,
  add column if not exists logo_dark_url text,
  add column if not exists logo_icon_url text,
  add column if not exists wordmark_url text,
  add column if not exists og_image_url text,
  add column if not exists favicon_svg_url text,
  add column if not exists favicon_32_url text,
  add column if not exists favicon_180_url text,
  add column if not exists favicon_512_url text,
  add column if not exists manifest_url text,
  add column if not exists draft_tokens jsonb,
  add column if not exists published_at timestamptz default now();

-- Backfill: copy primary_logo_url -> logo_light_url and font_family -> body_font
update public.global_settings
   set logo_light_url = coalesce(logo_light_url, primary_logo_url),
       body_font = coalesce(body_font, font_family),
       heading_font = coalesce(heading_font, font_family)
 where true;

-- 2. Tenants table (top layer for multi-tenant white-label)
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  host text unique,
  tokens jsonb not null default '{}'::jsonb,
  logo_light_url text,
  logo_dark_url text,
  favicon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.tenants to anon, authenticated;
grant all on public.tenants to service_role;
alter table public.tenants enable row level security;

drop policy if exists "Tenants readable by all" on public.tenants;
create policy "Tenants readable by all" on public.tenants
  for select to anon, authenticated using (true);

drop policy if exists "Admins can write tenants" on public.tenants;
create policy "Admins can write tenants" on public.tenants
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 3. Brand presets
create table if not exists public.brand_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tokens jsonb not null default '{}'::jsonb,
  logo_urls jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select on public.brand_presets to authenticated;
grant all on public.brand_presets to service_role;
alter table public.brand_presets enable row level security;

drop policy if exists "Admins manage presets" on public.brand_presets;
create policy "Admins manage presets" on public.brand_presets
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 4. Brand versions (snapshots written at publish time)
create table if not exists public.brand_versions (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','tenant','department')),
  scope_id uuid,
  snapshot jsonb not null,
  label text,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now()
);

create index if not exists brand_versions_scope_idx
  on public.brand_versions(scope, scope_id, published_at desc);

grant select on public.brand_versions to authenticated;
grant all on public.brand_versions to service_role;
alter table public.brand_versions enable row level security;

drop policy if exists "Admins read versions" on public.brand_versions;
create policy "Admins read versions" on public.brand_versions
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins write versions" on public.brand_versions;
create policy "Admins write versions" on public.brand_versions
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
