-- Sessions (city events) must be attached to either a room OR a stage,
-- never both. This is what makes that room / stage unavailable for
-- room reservations and music gigs during the event.

alter table public.sessions
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

create index if not exists idx_sessions_room_id  on public.sessions(room_id);
create index if not exists idx_sessions_stage_id on public.sessions(stage_id);
create index if not exists idx_sessions_times    on public.sessions(start_time, end_time);

-- Backfill safety: existing rows with neither room nor stage are left as-is
-- (the check constraint is permissive about NULL/NULL so legacy rows survive).
-- New writes go through the server fn which enforces "exactly one".
alter table public.sessions drop constraint if exists sessions_room_xor_stage_chk;
alter table public.sessions add constraint sessions_room_xor_stage_chk
  check (
    (room_id is null and stage_id is null)
    or (room_id is not null and stage_id is null)
    or (room_id is null and stage_id is not null)
  );
