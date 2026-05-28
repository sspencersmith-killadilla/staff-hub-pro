-- Guidebook Ad Space sponsor tier + sponsor ad copy field
alter table public.sponsors
  add column if not exists ad_copy text;

alter table public.sponsorship_tiers
  add column if not exists placement text;

-- Optional convenience: ensure the placement column has an index-friendly default for filtering
update public.sponsorship_tiers
   set placement = 'event'
 where placement is null;
