## Goal
Improve the event-attendee audience segment dropdown in the communications campaign builder so staff can quickly identify events by date and aren't overwhelmed by stale entries.

## What to change
File: `src/routes/_authenticated/staff/communications.$id.tsx` (AddSegment component, event-attendees sub-select)

1. **Add date to label**
   - Render each option as: `MM/DD/YYYY — Event Title` (or similar readable format)
   - Uses `e.start_time` already present on session rows

2. **Sort most-recent first**
   - Sort filtered events descending by `start_time`
   - Events with no `start_time` appear at the bottom

3. **1-month lookback filter**
   - Only include events whose `start_time` is >= 30 days before today (or `start_time` is null — keep undated events so they remain selectable)
   - Events older than 1 month are hidden from the dropdown entirely

No backend or schema changes needed. The `events` array is already fetched client-side via `useQuery` from `listEvents()`.

## Acceptance
- Dropdown labels show date + title
- Most recent event sits at top of list
- Events older than 1 month are omitted
- Existing campaign saving / audience logic is untouched