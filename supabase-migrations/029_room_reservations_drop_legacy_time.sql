-- ============================================================
-- 029 — Drop legacy NOT NULL start_time/end_time columns from
-- room_reservations and recreate the no_double_book exclusion
-- constraint against the canonical starts_at/ends_at columns.
-- ============================================================

-- Backfill canonical columns from legacy ones if they still exist
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

-- Drop the dependent constraint (it references start_time/end_time)
alter table public.room_reservations drop constraint if exists no_double_book;

-- Now safe to drop the legacy columns
alter table public.room_reservations
  drop column if exists start_time,
  drop column if exists end_time;

-- Recreate the double-booking guard against canonical columns,
-- scoped to approved reservations only.
create extension if not exists btree_gist;

alter table public.room_reservations
  add constraint no_double_book
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'approved');
