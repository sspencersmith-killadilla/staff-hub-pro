-- 042: Email campaign open/click tracking
alter table public.campaign_recipients
  add column if not exists opens_count integer not null default 0,
  add column if not exists clicks_count integer not null default 0,
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at timestamptz,
  add column if not exists first_clicked_at timestamptz,
  add column if not exists last_clicked_at timestamptz;

create table if not exists public.campaign_link_clicks (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.campaign_recipients(id) on delete cascade,
  campaign_id uuid not null references public.communication_campaigns(id) on delete cascade,
  url text not null,
  user_agent text,
  clicked_at timestamptz not null default now()
);
create index if not exists idx_link_clicks_campaign on public.campaign_link_clicks(campaign_id);
create index if not exists idx_link_clicks_recipient on public.campaign_link_clicks(recipient_id);

grant select on public.campaign_link_clicks to authenticated;
grant all on public.campaign_link_clicks to service_role;

alter table public.campaign_link_clicks enable row level security;

create policy "staff view link clicks" on public.campaign_link_clicks
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));
