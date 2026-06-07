-- 045_civic_quests_module.sql — Register Civic Quests as a toggleable platform module.

insert into public.platform_modules (key, label, description, enabled)
values (
  'civic_quests',
  'Civic Quests & Discovery',
  'Gamified self-guided adventures: badges, points, QR/geo waypoints, leaderboard, and reports.',
  true
)
on conflict (key) do nothing;
