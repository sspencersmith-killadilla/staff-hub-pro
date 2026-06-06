-- ============================================================
-- 040 — Email integration settings (admin-managed, web UI)
-- ============================================================
-- Allows admins to configure the email-sending provider
-- (Resend today) from /staff/admin/email-settings instead of
-- needing to set RESEND_API_KEY / RESEND_FROM env vars.

create table if not exists public.email_integration_settings (
  provider text primary key check (provider in ('resend')),
  api_key text,
  from_address text,
  reply_to text,
  site_url text,
  is_active boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.email_integration_settings to authenticated;
grant all on public.email_integration_settings to service_role;

alter table public.email_integration_settings enable row level security;

drop policy if exists "admins manage email integration settings"
  on public.email_integration_settings;
create policy "admins manage email integration settings"
on public.email_integration_settings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Seed the resend row so saves can use UPDATE.
insert into public.email_integration_settings (provider) values ('resend')
on conflict (provider) do nothing;
