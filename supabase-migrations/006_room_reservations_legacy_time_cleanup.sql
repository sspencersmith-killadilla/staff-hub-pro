-- Remove legacy room reservation time columns that conflict with the app's
-- canonical starts_at / ends_at columns.

alter table public.room_reservations
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

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
end $$;

alter table public.room_reservations
  drop column if exists start_time,
  drop column if exists end_time;