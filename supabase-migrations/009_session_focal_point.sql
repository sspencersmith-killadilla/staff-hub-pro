-- Add focal-point columns so admins can pick the "best spot" of an event image.
-- Values are percentages (0-100) used as CSS object-position in the events feed.

alter table public.sessions
  add column if not exists focal_x smallint not null default 50,
  add column if not exists focal_y smallint not null default 50;

alter table public.sessions
  add constraint sessions_focal_x_range check (focal_x between 0 and 100),
  add constraint sessions_focal_y_range check (focal_y between 0 and 100);
