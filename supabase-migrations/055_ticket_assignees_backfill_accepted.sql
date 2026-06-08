-- Any row with a real staff_user_id should be considered accepted.
update public.ticket_assignees
   set accepted_at = coalesce(accepted_at, assigned_at, now())
 where staff_user_id is not null
   and accepted_at is null;
