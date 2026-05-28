-- Cross-departmental resource requisition: track which department is
-- requesting a room booked from another department.
alter table public.room_reservations
  add column if not exists requester_department_id uuid
  references public.departments(id) on delete set null;

create index if not exists room_reservations_requester_department_idx
  on public.room_reservations (requester_department_id);
