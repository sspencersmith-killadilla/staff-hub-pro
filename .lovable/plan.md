# Ticket Waitlist

Let users join a waitlist for a sold-out ticket tier on the public event page, and surface waitlist entries to staff.

## Migration `013_ticket_waitlist.sql`

New table:

```sql
create table public.ticket_waitlist (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  ticket_tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  full_name text not null,
  email text not null,
  quantity int not null default 1,
  notified_at timestamptz,
  converted_attendee_id uuid references public.attendees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ticket_tier_id, email)
);
```

Grants + RLS:
- `grant select, insert on public.ticket_waitlist to anon, authenticated;`
- `grant all on public.ticket_waitlist to service_role;`
- RLS: allow `insert` to anon/authenticated; reads only via service role (staff server fns).

## Server functions

**Public** (`src/lib/events-public.functions.ts`):
- `getTierAvailability({ session_id })` — returns each tier's `sold` count vs `capacity` so the UI can detect sold-out. (Or extend `getEventDetail` to include this; simpler.)
- `joinTicketWaitlist({ session_id, ticket_tier_id, full_name, email, quantity })` — validates with Zod, verifies the tier belongs to the session, upserts on `(ticket_tier_id, email)`.

**Staff** (`src/lib/event-dashboard.functions.ts` — extend `getEventDashboard`):
- Include `waitlist` rows joined to tier name.
- New `removeFromWaitlist({ id })` for staff cleanup.

## Public UI (`src/routes/events.$id.tsx`)

- Compute `soldOut` per tier from availability data.
- When a tier is sold out: replace the radio with a "Sold out — Join waitlist" button. Selecting it switches the form's submit action to call `joinTicketWaitlist` instead of `registerForCityEvent`, and the success message reads "You're on the waitlist."
- Tiers with `capacity = 0` are treated as unlimited (no sold-out state).

## Staff UI (`src/routes/_authenticated/staff/events.$id.tsx`)

- Add a "Waitlist" sub-section under the Tickets tab (or new tab if preferred): table of name, email, qty, tier, joined date, with a Remove button.
- Show waitlist count badge on the per-tier breakdown row in the Reports tab.

## Out of scope

- Automated notification when a seat opens (manual staff outreach for now).
- Auto-promotion of waitlist entries to attendees on cancellation.
- Position-in-line display.

Both can be added later — `notified_at` and `converted_attendee_id` columns are in place to support them.
