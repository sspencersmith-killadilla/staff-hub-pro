-- Executive Analytics: views + RPC powering /staff/admin/analytics.
-- Safe to re-run.

-- ─── vw_venue_utilization ────────────────────────────────────────────
-- Booked hours from approved room_reservations, per room/venue, for
-- 30 / 90 / 365 day windows. Available hours = window_days * 24.
drop view if exists public.vw_venue_utilization cascade;
create view public.vw_venue_utilization as
with bookings as (
  select
    r.id                as room_id,
    r.name              as room_name,
    r.venue_id          as venue_id,
    r.department_id     as department_id,
    rr.starts_at,
    rr.ends_at
  from public.rooms r
  left join public.room_reservations rr
    on rr.room_id = r.id
   and rr.status in ('approved')
)
select
  b.room_id,
  b.room_name,
  b.venue_id,
  b.department_id,
  coalesce(sum(case when b.starts_at >= now() - interval '30 days'
                   then extract(epoch from (b.ends_at - b.starts_at)) / 3600 end), 0)::numeric(12,2)  as booked_hours_30d,
  coalesce(sum(case when b.starts_at >= now() - interval '90 days'
                   then extract(epoch from (b.ends_at - b.starts_at)) / 3600 end), 0)::numeric(12,2)  as booked_hours_90d,
  coalesce(sum(case when b.starts_at >= now() - interval '365 days'
                   then extract(epoch from (b.ends_at - b.starts_at)) / 3600 end), 0)::numeric(12,2)  as booked_hours_365d,
  (30  * 24)::numeric as available_hours_30d,
  (90  * 24)::numeric as available_hours_90d,
  (365 * 24)::numeric as available_hours_365d,
  least(100, coalesce(sum(case when b.starts_at >= now() - interval '30 days'
                   then extract(epoch from (b.ends_at - b.starts_at)) / 3600 end), 0) / (30 * 24) * 100)::numeric(5,2) as utilization_pct_30d,
  least(100, coalesce(sum(case when b.starts_at >= now() - interval '90 days'
                   then extract(epoch from (b.ends_at - b.starts_at)) / 3600 end), 0) / (90 * 24) * 100)::numeric(5,2) as utilization_pct_90d,
  least(100, coalesce(sum(case when b.starts_at >= now() - interval '365 days'
                   then extract(epoch from (b.ends_at - b.starts_at)) / 3600 end), 0) / (365 * 24) * 100)::numeric(5,2) as utilization_pct_365d
from bookings b
group by b.room_id, b.room_name, b.venue_id, b.department_id;

grant select on public.vw_venue_utilization to authenticated, service_role;

-- ─── vw_department_revenue ───────────────────────────────────────────
-- Unified monthly revenue by department + revenue stream (source).
-- Sources: 'permits', 'vendors', 'tickets', 'classes'.
drop view if exists public.vw_department_revenue cascade;
create view public.vw_department_revenue as
-- Special event permits (paid)
select
  p.department_id,
  date_trunc('month', coalesce(p.paid_at, p.updated_at))::date as month,
  'permits'::text as source,
  coalesce(p.calculated_fee, 0)::numeric(12,2) as amount
from public.special_event_permits p
where p.status = 'paid'
union all
-- Vendor booth payments
select
  s.department_id,
  date_trunc('month', v.created_at)::date as month,
  'vendors'::text as source,
  coalesce(vt.price, 0)::numeric(12,2) as amount
from public.vendors v
left join public.sessions s on s.id = v.session_id
left join public.vendor_tiers vt on vt.id = v.vendor_tier_id
where v.status = 'paid'
union all
-- Ticket purchases (approved)
select
  s.department_id,
  date_trunc('month', tp.created_at)::date as month,
  'tickets'::text as source,
  (tp.amount_cents::numeric / 100.0)::numeric(12,2) as amount
from public.ticket_payments tp
left join public.sessions s on s.id = tp.session_id
where tp.status = 'approved'
union all
-- Class enrollments (paid)
select
  c.department_id,
  date_trunc('month', e.created_at)::date as month,
  'classes'::text as source,
  (coalesce(e.amount_cents, 0)::numeric / 100.0)::numeric(12,2) as amount
from public.enrollments e
left join public.course_sessions cs on cs.id = e.session_id
left join public.courses c on c.id = cs.course_id
where e.payment_status = 'paid';

grant select on public.vw_department_revenue to authenticated, service_role;

-- ─── calculate_economic_impact RPC ───────────────────────────────────
create or replace function public.calculate_economic_impact(
  estimated_attendance numeric,
  average_ticket_price numeric,
  multiplier numeric
)
returns table (
  direct_revenue      numeric,
  secondary_impact    numeric,
  total_impact        numeric,
  year_1_impact       numeric,
  year_5_impact       numeric
)
language sql
stable
as $$
  with calc as (
    select
      (coalesce(estimated_attendance, 0) * coalesce(average_ticket_price, 0))::numeric as direct
  )
  select
    round(direct, 2)                                                          as direct_revenue,
    round(direct * (coalesce(multiplier, 1) - 1), 2)                          as secondary_impact,
    round(direct * coalesce(multiplier, 1), 2)                                as total_impact,
    round(direct * coalesce(multiplier, 1) * 12, 2)                           as year_1_impact,
    round(direct * coalesce(multiplier, 1) * 12 * 5, 2)                       as year_5_impact
  from calc;
$$;

grant execute on function public.calculate_economic_impact(numeric, numeric, numeric)
  to authenticated, service_role;
