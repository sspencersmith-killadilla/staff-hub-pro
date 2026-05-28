-- Add phone to profiles so admins can manage staff contact info.
alter table public.profiles
  add column if not exists phone text;
