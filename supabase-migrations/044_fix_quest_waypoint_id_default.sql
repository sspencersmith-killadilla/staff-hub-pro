-- 044_fix_quest_waypoint_id_default.sql — ensure waypoint IDs are generated server-side.

alter table public.quest_waypoints
  alter column id set default gen_random_uuid();