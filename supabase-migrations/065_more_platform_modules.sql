-- 065: make 311 and Prizes & Raffles switchable per city, like other modules.
insert into public.platform_modules (key, label, description, enabled) values
  ('reports_311', '311 Reports & Dispatch', 'Residents report non-emergency issues; staff dispatch, track costs and assets.', true),
  ('prizes_raffles', 'Prizes & Raffles', 'Quest prize tickets, redemption scanning, and raffle drawings.', true)
on conflict (key) do nothing;
