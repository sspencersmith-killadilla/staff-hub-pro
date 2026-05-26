-- Community-event flyer fields. The events table already has image_url; add
-- focal-point columns and let community organizers control them.

alter table public.events
  add column if not exists image_focal_x smallint not null default 50,
  add column if not exists image_focal_y smallint not null default 50;

alter table public.events
  drop constraint if exists events_image_focal_x_range,
  drop constraint if exists events_image_focal_y_range;

alter table public.events
  add constraint events_image_focal_x_range check (image_focal_x between 0 and 100),
  add constraint events_image_focal_y_range check (image_focal_y between 0 and 100);
