-- Security fixes:
-- 1) Lock down grant_assignee_access RPC (privilege escalation)
-- 2) Hide internal_note from ticket owners (column-level grants)
-- 3) Remove anon/authenticated read on campaign_unsubscribes

-- 1) grant_assignee_access: revoke from authenticated; only service_role may call.
revoke execute on function public.grant_assignee_access(uuid, uuid) from authenticated;
-- (service_role grant remains from migration 054)

-- 2) ticket_updates: restrict authenticated column access to non-internal columns.
revoke select on public.ticket_updates from authenticated;
grant select (id, ticket_id, staff_id, status_change, public_note, created_at)
  on public.ticket_updates to authenticated;
-- Re-grant insert (revoke select didn't drop insert, but be explicit/idempotent)
grant insert on public.ticket_updates to authenticated;

-- Staff still need internal_note. Replace the owner read policy + add a
-- separate staff policy that allows full column read.
-- The existing "ticket_updates_staff_read" policy already covers staff SELECT,
-- but column-level GRANTs apply regardless of policy. Re-grant full SELECT to
-- service_role and use a security-definer staff view for internal notes? Simpler:
-- give staff full column access by granting SELECT on all columns to a staff
-- path via the existing RLS; column GRANTs apply per role, not per policy, so
-- we instead expose internal_note to staff through a dedicated view.

create or replace view public.ticket_updates_internal
  with (security_invoker = on) as
  select id, ticket_id, staff_id, status_change, public_note, internal_note, created_at
  from public.ticket_updates;

grant select on public.ticket_updates_internal to authenticated;

-- 3) campaign_unsubscribes: drop public read policy. Server uses service_role.
drop policy if exists "anyone read unsubs" on public.campaign_unsubscribes;
revoke select on public.campaign_unsubscribes from anon, authenticated;
