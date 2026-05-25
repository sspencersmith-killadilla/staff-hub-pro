-- Lock down room_reservations insert policy.
-- The previous "anyone can request" policy applied to ALL roles (including anon),
-- allowing direct REST inserts with the public anon key, bypassing the
-- server function's validation and auth layer.

drop policy if exists "anyone can request" on public.room_reservations;

-- Only authenticated users can create a pending request, and they must
-- claim their own auth.uid() as requester_user_id (prevents impersonation).
create policy "authenticated can request" on public.room_reservations
  for insert to authenticated
  with check (
    status = 'pending'
    and requester_user_id = auth.uid()
  );
