-- Allow guidebook (or any) sponsors to exist without being tied to a session.
alter table public.sponsors alter column session_id drop not null;
