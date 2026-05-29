-- ============================================================
-- 028 — Social Media Command Center
-- ============================================================

-- 1) Platform OAuth credentials (admin-managed, one row per platform)
create table if not exists public.social_integration_secrets (
  platform text primary key check (platform in ('meta','linkedin')),
  client_id text,
  client_secret text,
  redirect_uri text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.social_integration_secrets to authenticated;
grant all on public.social_integration_secrets to service_role;

alter table public.social_integration_secrets enable row level security;

drop policy if exists "admins manage social integration secrets"
  on public.social_integration_secrets;
create policy "admins manage social integration secrets"
on public.social_integration_secrets
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- 2) Per-department social account connections
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram','linkedin')),
  account_id text not null,
  account_name text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[],
  connected_by uuid references auth.users(id),
  connected_at timestamptz not null default now(),
  unique (department_id, platform, account_id)
);

create index if not exists social_connections_dept_idx
  on public.social_connections(department_id);

grant select, insert, update, delete on public.social_connections to authenticated;
grant all on public.social_connections to service_role;

alter table public.social_connections enable row level security;

drop policy if exists "staff with permission manage social connections"
  on public.social_connections;
create policy "staff with permission manage social connections"
on public.social_connections
for all
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.staff_permissions sp
    where sp.user_id = auth.uid()
      and sp.permission = 'page.social_command'
  )
)
with check (
  public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.staff_permissions sp
    where sp.user_id = auth.uid()
      and sp.permission = 'page.social_command'
  )
);

-- 3) Social posts (scheduled / published)
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  scheduled_for timestamptz not null,
  caption text not null default '',
  media_url text,
  event_id uuid,
  platforms text[] not null default '{}'::text[],
  status text not null default 'scheduled'
    check (status in ('scheduled','publishing','published','failed','partial')),
  results jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists social_posts_dept_idx
  on public.social_posts(department_id, scheduled_for);

grant select, insert, update, delete on public.social_posts to authenticated;
grant all on public.social_posts to service_role;

alter table public.social_posts enable row level security;

drop policy if exists "staff with permission manage social posts"
  on public.social_posts;
create policy "staff with permission manage social posts"
on public.social_posts
for all
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.staff_permissions sp
    where sp.user_id = auth.uid()
      and sp.permission = 'page.social_command'
  )
)
with check (
  public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.staff_permissions sp
    where sp.user_id = auth.uid()
      and sp.permission = 'page.social_command'
  )
);

-- 4) Backfill the new permission for everyone who already has staff/admin role
insert into public.staff_permissions (user_id, permission)
select ur.user_id, 'page.social_command'
from public.user_roles ur
where ur.role in ('staff','admin')
on conflict do nothing;

-- 5) Seed empty integration rows so the admin page has them to edit
insert into public.social_integration_secrets (platform) values ('meta')
  on conflict (platform) do nothing;
insert into public.social_integration_secrets (platform) values ('linkedin')
  on conflict (platform) do nothing;
