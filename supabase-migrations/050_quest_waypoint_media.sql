-- 050_quest_waypoint_media.sql — Waypoint images for richer quest UX.

alter table public.quest_waypoints
  add column if not exists image_url text,
  add column if not exists image_alt text;

-- Re-grant the read column set so anon/authenticated can SELECT the new columns.
-- (Previous grant in 043 enumerated columns explicitly.)
grant select (
  id, quest_id, title, description, completion_type,
  lat, lng, radius_m, sort_order, created_at, image_url, image_alt
) on public.quest_waypoints to anon, authenticated;
