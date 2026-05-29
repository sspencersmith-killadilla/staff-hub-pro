-- ============================================================
-- 029 — Ensure legacy NOT NULL start_time/end_time columns are gone
-- from room_reservations. Migration 006 should have handled this,
-- but some environments still have the legacy columns, which causes
-- inserts (e.g. course session blocks) to fail with:
--   null value in column "start_time" of relation "room_reservations"
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'room_reservations'
      and column_name = 'start_time'
  ) then
    execute 'update public.room_reservations set starts_at = coalesce(starts_at, start_time) where starts_at is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'room_reservations'
      and column_name = 'end_time'
  ) then
    execute 'update public.room_reservations set ends_at = coalesce(ends_at, end_time) where ends_at is null';
  end if;
end$$;

alter table public.room_reservations
  drop column if exists start_time,
  drop column if exists end_time;
