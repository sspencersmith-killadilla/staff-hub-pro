-- Allow guidebook (or any) sponsors to exist without being tied to a session,
-- and allow the guidebook sponsorship tier itself to be session-less.
alter table public.sponsors        alter column session_id drop not null;
alter table public.sponsorship_tiers alter column session_id drop not null;
