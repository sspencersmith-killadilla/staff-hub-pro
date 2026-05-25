-- Ticket payment records for USAePay (or future providers).
create table if not exists public.ticket_payments (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid references public.attendees(id) on delete set null,
  session_id uuid not null,
  user_id uuid,
  provider text not null default 'usaepay',
  mode text not null default 'sandbox', -- 'sandbox' | 'live'
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'pending', -- pending | approved | declined | error
  transaction_ref text, -- USAePay refnum
  auth_code text,
  result_code text,
  error_message text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

alter table public.ticket_payments enable row level security;

-- Users can read their own payment rows.
drop policy if exists "ticket_payments_self_read" on public.ticket_payments;
create policy "ticket_payments_self_read"
on public.ticket_payments for select
to authenticated
using (user_id = auth.uid());

-- Inserts and updates happen only via service role (server functions).
create index if not exists idx_ticket_payments_session on public.ticket_payments(session_id);
create index if not exists idx_ticket_payments_attendee on public.ticket_payments(attendee_id);
