-- 311: scoped staff access on ticket assignment.
--
-- When a user is assigned to a ticket (directly or via email-invite that later
-- claims), make sure they actually have permission to see and update it:
--   * Ensure they hold the global 'staff' app role (never 'admin').
--   * Add them as a `staff` member of every department currently linked to
--     the ticket via ticket_departments.
--
-- Idempotent: skips rows that already exist.

create or replace function public.grant_assignee_access(
  _ticket_id uuid,
  _user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if _user_id is null or _ticket_id is null then
    return;
  end if;

  -- 1) Global staff role (no-op if user already has 'staff' or 'admin').
  insert into public.user_roles (user_id, role)
  select _user_id, 'staff'::public.app_role
  where not exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role in ('staff'::public.app_role, 'admin'::public.app_role)
  );

  -- 2) Department-scoped staff role for every department on this ticket.
  insert into public.department_roles (user_id, department_id, role)
  select _user_id, td.department_id, 'staff'::public.department_role
  from public.ticket_departments td
  where td.ticket_id = _ticket_id
  on conflict (user_id, department_id, role) do nothing;
end;
$$;

grant execute on function public.grant_assignee_access(uuid, uuid) to authenticated, service_role;

-- Extend the auth.users signup trigger so claimed invites also receive access.
create or replace function public.claim_ticket_assignee_invites()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  r record;
begin
  if new.email is null then
    return new;
  end if;

  update public.ticket_assignees
    set staff_user_id = new.id,
        invited_email = null,
        accepted_at = coalesce(accepted_at, now())
    where invited_email is not null
      and lower(invited_email) = lower(new.email);

  for r in
    select ticket_id from public.ticket_assignees
    where staff_user_id = new.id
  loop
    perform public.grant_assignee_access(r.ticket_id, new.id);
  end loop;

  return new;
end;
$$;

-- Backfill: grant access for every already-accepted assignment.
do $$
declare r record;
begin
  for r in
    select ticket_id, staff_user_id
    from public.ticket_assignees
    where staff_user_id is not null
  loop
    perform public.grant_assignee_access(r.ticket_id, r.staff_user_id);
  end loop;
end $$;
