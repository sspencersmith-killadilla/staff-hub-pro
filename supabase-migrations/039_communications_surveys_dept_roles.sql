-- Allow department-scoped staff (dept_admin / staff / super_admin) to manage
-- campaigns and surveys, matching the UI permission model (getMyPermissions).

create or replace function public._has_dept_staff_role(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.department_roles
    where user_id = _uid
      and role in ('dept_admin', 'staff', 'super_admin')
  )
$$;

-- Campaigns
drop policy if exists "staff manage campaigns" on public.communication_campaigns;
create policy "staff manage campaigns" on public.communication_campaigns
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  ) with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  );

drop policy if exists "staff view recipients" on public.campaign_recipients;
create policy "staff view recipients" on public.campaign_recipients
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  ) with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  );

-- Surveys
drop policy if exists "staff manage surveys" on public.surveys;
create policy "staff manage surveys" on public.surveys
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  ) with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  );

drop policy if exists "staff manage questions" on public.survey_questions;
create policy "staff manage questions" on public.survey_questions
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  ) with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  );

drop policy if exists "staff view responses" on public.survey_responses;
create policy "staff view responses" on public.survey_responses
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  );

drop policy if exists "staff delete responses" on public.survey_responses;
create policy "staff delete responses" on public.survey_responses
  for delete to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
    or public._has_dept_staff_role(auth.uid())
  );
