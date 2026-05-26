# Expand Event Reports Tab

The Reports tab on `/staff/events/$id` currently shows only Gross Revenue, Talent Costs, and Net. All raw data needed for richer metrics is already returned by `getEventDashboard` (attendees, ticket_tiers, vendors, vendor_tiers, sponsors, sponsorship_tiers, talent) — so this is a frontend-only change in `src/routes/_authenticated/staff/events.$id.tsx`.

## Metrics to add

**Tickets**
- Tickets Sold — count of attendees (sum of `quantity` where present, else row count)
- Ticket Capacity — sum of `ticket_tiers.capacity`
- Fill Rate — sold / capacity (%)
- Checked In — attendees with `checked_in = true`
- Show Rate — checked-in / sold (%)
- Ticket Revenue — already computed (`ticketRev`)
- Per-tier breakdown table: tier name, sold, capacity, fill %, revenue

**Vendors**
- Vendors Approved/Paid — count where status ∈ {approved, paid}
- Vendor Capacity — sum of `vendor_tiers.capacity`
- Vendor Fill Rate — approved / capacity (%)
- Vendor Revenue — already computed (`vendorRev`)
- Pending applications count

**Sponsors**
- Sponsors Approved/Paid — count where status ∈ {approved, paid}
- Sponsor Slot Capacity — sum of `sponsorship_tiers.capacity`
- Sponsor Fill Rate — approved / capacity (%)
- Sponsor Revenue — already computed (`sponsorRev`)
- Pending applications count

**Financial (already shown, regroup)**
- Gross Revenue, Talent Costs, Net Profit
- Revenue split: Tickets / Vendors / Sponsors

## Layout

Reorganize the Reports tab into three sections, each a card with a header and a grid of `<Stat>` tiles:

```text
┌─ Financial ────────────────────────────┐
│ Gross | Talent Cost | Net | Tix/Ven/Spn split │
├─ Tickets ──────────────────────────────┤
│ Sold | Capacity | Fill % | Checked In | Show % │
│ Per-tier table                          │
├─ Vendors & Sponsors ───────────────────┤
│ Vendor: Approved | Capacity | Fill % | Pending │
│ Sponsor: Approved | Capacity | Fill % | Pending │
└────────────────────────────────────────┘
```

Reuse the existing `Stat` component. Add a small `Section` wrapper for the headers. Guard all divisions against zero capacity (show `—` instead of `NaN%`).

## Technical notes

- All computations done inline in the component with `useMemo` for the per-tier breakdown.
- `ticketsRedeemed` already exists — rename usage to `checkedIn` in the new section.
- For tier-level sold counts: group attendees by `ticket_tier_id` (need to confirm the field is on attendee rows; if not, expand the select in `getEventDashboard` to include `ticket_tier_id` — one-line change).
- No new server function, no migration.

## Out of scope

- Time-series charts (sales over time)
- CSV export
- Comparison to prior events

Easy to add later if desired.
