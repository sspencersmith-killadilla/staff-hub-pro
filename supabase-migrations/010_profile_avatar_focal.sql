-- Focal-point for musician avatars. Drives object-position when the avatar
-- is shown inside a cropped 16:9 card on the events page.

alter table public.profiles
  add column if not exists avatar_focal_x smallint not null default 50,
  add column if not exists avatar_focal_y smallint not null default 50;

alter table public.profiles
  add constraint profiles_avatar_focal_x_range check (avatar_focal_x between 0 and 100),
  add constraint profiles_avatar_focal_y_range check (avatar_focal_y between 0 and 100);
