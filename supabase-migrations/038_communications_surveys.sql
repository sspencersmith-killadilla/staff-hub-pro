-- Communications & Surveys module
-- Campaigns
create table if not exists public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  subject text not null,
  body_html text not null default '',
  body_json jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','failed')),
  target_audience_rules jsonb not null default '{"segments":[]}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  recipient_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaigns_status on public.communication_campaigns(status);
create index if not exists idx_campaigns_scheduled on public.communication_campaigns(scheduled_for) where status = 'scheduled';

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.communication_campaigns(id) on delete cascade,
  email text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','suppressed')),
  error text,
  resend_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_recipients_campaign on public.campaign_recipients(campaign_id);

create table if not exists public.campaign_unsubscribes (
  email text primary key,
  unsubscribed_at timestamptz not null default now()
);

-- Surveys
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  description_html text not null default '',
  is_active boolean not null default true,
  redirect_to text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  position integer not null default 0,
  question_text text not null,
  question_type text not null check (question_type in ('text','rating_1_to_5','multiple_choice')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_questions_survey on public.survey_questions(survey_id, position);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);
create index if not exists idx_responses_survey on public.survey_responses(survey_id);

-- GRANTS
grant select, insert, update, delete on public.communication_campaigns to authenticated;
grant all on public.communication_campaigns to service_role;

grant select, insert, update, delete on public.campaign_recipients to authenticated;
grant all on public.campaign_recipients to service_role;

grant select, insert on public.campaign_unsubscribes to anon, authenticated;
grant all on public.campaign_unsubscribes to service_role;

grant select, insert, update, delete on public.surveys to authenticated;
grant select on public.surveys to anon;
grant all on public.surveys to service_role;

grant select, insert, update, delete on public.survey_questions to authenticated;
grant select on public.survey_questions to anon;
grant all on public.survey_questions to service_role;

grant insert on public.survey_responses to anon, authenticated;
grant select, delete on public.survey_responses to authenticated;
grant all on public.survey_responses to service_role;

-- RLS
alter table public.communication_campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_unsubscribes enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_responses enable row level security;

-- Staff-only management for campaigns
create policy "staff manage campaigns" on public.communication_campaigns
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff')
  ) with check (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff')
  );

create policy "staff view recipients" on public.campaign_recipients
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "anyone unsubscribe" on public.campaign_unsubscribes
  for insert to anon, authenticated with check (true);
create policy "anyone read unsubs" on public.campaign_unsubscribes
  for select to anon, authenticated using (true);

-- Surveys: staff manage; public can read active surveys & questions
create policy "staff manage surveys" on public.surveys
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "public read active surveys" on public.surveys
  for select to anon, authenticated using (is_active = true);

create policy "staff manage questions" on public.survey_questions
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "public read questions" on public.survey_questions
  for select to anon, authenticated
  using (exists (select 1 from public.surveys s where s.id = survey_id and s.is_active = true));

-- Responses: anyone can submit (anonymous); staff can view
create policy "anyone submit response" on public.survey_responses
  for insert to anon, authenticated with check (true);

create policy "staff view responses" on public.survey_responses
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "staff delete responses" on public.survey_responses
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));
