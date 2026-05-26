-- One attendee row per seat so each ticket gets its own QR code.
-- group_id links sibling rows from the same purchase.

alter table public.attendees
  add column if not exists group_id uuid;

create index if not exists attendees_group_id_idx
  on public.attendees (group_id);
