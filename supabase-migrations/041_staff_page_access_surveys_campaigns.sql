-- Keep communications/surveys backend writes aligned with the UI permission model.
-- Access is allowed for global staff/admin, department-scoped staff/admin roles,
-- or explicit page-level staff permissions.

create or replace function public._has_staff_page_access(_uid uuid, _permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(_uid is not null and (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = _uid
        and ur.role::text in ('admin', 'staff')
    )
    or exists (
      select 1
      from public.department_roles dr
      where dr.user_id = _uid
        and dr.role::text in ('super_admin', 'dept_admin', 'staff')
    )
    or exists (
      select 1
      from public.staff_permissions sp
      where sp.user_id = _uid
        and sp.permission = _permission
    )
  ), false)
$$;

drop policy if exists "staff manage campaigns" on public.communication_campaigns;
create policy "staff manage campaigns" on public.communication_campaigns
  for all to authenticated
  using (public._has_staff_page_access(auth.uid(), 'page.communications'))
  with check (public._has_staff_page_access(auth.uid(), 'page.communications'));

drop policy if exists "staff view recipients" on public.campaign_recipients;
create policy "staff view recipients" on public.campaign_recipients
  for all to authenticated
  using (public._has_staff_page_access(auth.uid(), 'page.communications'))
  with check (public._has_staff_page_access(auth.uid(), 'page.communications'));

drop policy if exists "staff manage surveys" on public.surveys;
create policy "staff manage surveys" on public.surveys
  for all to authenticated
  using (public._has_staff_page_access(auth.uid(), 'page.surveys'))
  with check (public._has_staff_page_access(auth.uid(), 'page.surveys'));

drop policy if exists "staff manage questions" on public.survey_questions;
create policy "staff manage questions" on public.survey_questions
  for all to authenticated
  using (public._has_staff_page_access(auth.uid(), 'page.surveys'))
  with check (public._has_staff_page_access(auth.uid(), 'page.surveys'));

drop policy if exists "staff view responses" on public.survey_responses;
create policy "staff view responses" on public.survey_responses
  for select to authenticated
  using (public._has_staff_page_access(auth.uid(), 'page.surveys'));

drop policy if exists "staff delete responses" on public.survey_responses;
create policy "staff delete responses" on public.survey_responses
  for delete to authenticated
  using (public._has_staff_page_access(auth.uid(), 'page.surveys'));