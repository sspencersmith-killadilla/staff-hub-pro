-- ============================================================
-- STAFF PORTAL MIGRATION (Phase 1)
-- Run this in Supabase SQL Editor on project hwhndirmtnfuibcknxme
-- ============================================================

-- 1. App role enum + user_roles table (security best practice: roles in a separate table)
do $$ begin
  create type public.app_role as enum ('admin', 'staff');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- 2. Security definer helper to avoid recursive RLS
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- 3. RLS policies on user_roles
drop policy if exists "users can view own roles" on public.user_roles;
create policy "users can view own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "admins can view all roles" on public.user_roles;
create policy "admins can view all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage roles" on public.user_roles;
create policy "admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 4. BOOTSTRAP YOUR FIRST ADMIN
-- After running this script: sign up via the app at /signup with your email,
-- then come back here and run (replace the email):
--
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com';
