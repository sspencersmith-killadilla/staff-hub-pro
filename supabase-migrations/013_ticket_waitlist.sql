-- Ticket waitlist: lets people sign up when a tier is sold out.
create table if not exists public.ticket_waitlist (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  ticket_tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  full_name text not null,
  email text not null,
  quantity int not null default 1 check (quantity between 1 and 20),
  notified_at timestamptz,
  converted_attendee_id uuid references public.attendees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ticket_tier_id, email)
);

create index if not exists idx_ticket_waitlist_session on public.ticket_waitlist(session_id);
create index if not exists idx_ticket_waitlist_tier on public.ticket_waitlist(ticket_tier_id);

grant select, insert on public.ticket_waitlist to anon, authenticated;
grant all on public.ticket_waitlist to service_role;

alter table public.ticket_waitlist enable row level security;

-- Anyone may insert (public sign-up flow); reads happen via service role in staff server fns.
drop policy if exists "ticket_waitlist_public_insert" on public.ticket_waitlist;
create policy "ticket_waitlist_public_insert"
  on public.ticket_waitlist for insert
  to anon, authenticated
  with check (true);
