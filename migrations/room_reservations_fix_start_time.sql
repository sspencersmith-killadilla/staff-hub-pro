-- room_reservations had legacy start_time/end_time NOT NULL columns; the app
-- writes starts_at/ends_at instead. Drop the legacy columns if they exist.
alter table public.room_reservations drop column if exists start_time;
alter table public.room_reservations drop column if exists end_time;
