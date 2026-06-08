-- 050_quest_waypoint_media.sql — Waypoint images + quest-media storage bucket.

alter table public.quest_waypoints
  add column if not exists image_url text,
  add column if not exists image_alt text;

-- Re-grant the read column set so anon/authenticated can SELECT the new columns.
grant select (
  id, quest_id, title, description, completion_type,
  lat, lng, radius_m, sort_order, created_at, image_url, image_alt
) on public.quest_waypoints to anon, authenticated;

-- ─── Storage bucket for quest waypoint imagery ─────────────────────
insert into storage.buckets (id, name, public)
values ('quest-media', 'quest-media', true)
on conflict (id) do update set public = true;

drop policy if exists "quest-media public read" on storage.objects;
create policy "quest-media public read"
  on storage.objects for select
  using (bucket_id = 'quest-media');

drop policy if exists "quest-media service write" on storage.objects;
create policy "quest-media service write"
  on storage.objects for all
  to service_role
  using (bucket_id = 'quest-media')
  with check (bucket_id = 'quest-media');
