## Hide past events from the Social Command sidebar

**Problem:** The "Events" sidebar in Social Command Center (`src/routes/_authenticated/staff/admin.social.tsx`) lists every event, including past ones. They clutter the draggable list. Scheduled posts on past dates should still appear on the calendar.

**Change (one file):** `src/routes/_authenticated/staff/admin.social.tsx`

Filter the event list rendered in the sidebar (`DraggableEvent` mapping, around line 331) to exclude events whose `start_time` is in the past. Add a `useMemo` that returns events where `start_time` is missing/null (treat as upcoming/TBD) OR `new Date(start_time) >= startOfToday()`, sorted by `start_time` ascending so the next-up event is on top.

The calendar grid (`postsByDate` / `DroppableDay`) is unchanged — scheduled posts continue to render on whatever date they were scheduled for, including past dates. The `events` lookup used to label posts with `eventTitle` (line 173) still uses the full unfiltered query, so past-event posts keep their titles.

**Out of scope:** No backend, schema, or business-logic changes. Pure UI filter.