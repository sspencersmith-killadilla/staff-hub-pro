# 311 Issue Reporting Module

A dedicated workflow engine for citizens to report non-emergency issues (potholes, graffiti, park maintenance, etc.) with auto-routing to departments and real-time status tracking. Reuses existing patterns: department tenancy, staff guards, storage buckets, Google Maps connector, and the public/`_authenticated`/staff route split.

**Confirmed choices**: Google Maps via existing connector · Photo upload required · Sign-in required to submit.

## Part 1 — Database (new migration `046_tickets_311.sql`)

**`issue_categories`** — `id`, `name unique`, `description`, `default_department_id → departments`, `icon`, `sort_order`, `active`, `created_at`. Seeded: Pothole, Graffiti, Park Maintenance, Streetlight Out, Illegal Dumping, Sidewalk Damage, Tree/Brush, Other.

**`ticket_status` enum**: `submitted | received | in_progress | resolved`.

**`tickets`** — `id`, `user_id → auth.users NOT NULL`, `category_id`, `description`, `location_address`, `latitude`, `longitude`, `photo_url NOT NULL`, `status default 'submitted'`, `assigned_department_id → departments`, `created_at`, `updated_at`.
- BEFORE INSERT trigger: copy `default_department_id` from the category when `assigned_department_id` is null.
- Trigger to bump `updated_at`.

**`ticket_updates`** — `id`, `ticket_id → tickets ON DELETE CASCADE`, `staff_id → auth.users`, `status_change ticket_status`, `public_note`, `internal_note`, `created_at`.
- AFTER INSERT trigger: when `status_change` is set, propagate to parent `tickets.status`.

**Grants + RLS** (per project conventions):
- `GRANT SELECT, INSERT, UPDATE, DELETE` on tickets/ticket_updates to `authenticated`; `GRANT SELECT` on `issue_categories` to `anon, authenticated`; `GRANT ALL ... TO service_role`.
- `tickets` policies — citizens SELECT/INSERT own rows (`user_id = auth.uid()`); staff SELECT/UPDATE where `has_role(auth.uid(),'admin')` OR `assigned_department_id ∈ department_roles` for the user.
- `ticket_updates` — base table denies citizen SELECT. View `ticket_updates_public` (`security_invoker=on`) exposes only `id, ticket_id, status_change, public_note, created_at` for the ticket owner. Staff SELECT/INSERT scoped to admin or matching department.
- Enable Realtime on `tickets` and `ticket_updates`.

**Storage**: create public bucket `ticket-photos` via `supabase--storage_create_bucket`. RLS on `storage.objects`: authenticated INSERT into `tickets/{auth.uid()}/...`; public SELECT.

## Part 2 — Citizen Intake & Tracking

**Public route `/report`** (`src/routes/report.tsx`)
- If not signed in: inline "Sign in to report an issue" CTA linking to `/auth?redirect=/report` (no redirect loop; matches public-route convention).
- Mobile-first single-column `react-hook-form` + zod:
  - Category select (server fn `listIssueCategories`).
  - Description (required, 10–2000 chars).
  - **Photo upload (required)** to `ticket-photos` bucket via existing `ImageUploader` pattern.
  - Address text input + **"Use My Location"** button → `navigator.geolocation.getCurrentPosition` → reverse geocode through existing Google Maps connector gateway (`/maps/api/geocode/json`) to auto-fill address.
  - Live `RobustMap`-style preview centered on chosen coordinates (uses `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`).
- `createTicket` server fn (`requireSupabaseAuth`) inserts ticket; DB trigger handles auto-routing.
- On success → `/hub?tab=reports&new={id}`.

**`/hub` — "My Reports" tab** (edit `src/routes/_authenticated/hub.tsx`)
- New tab listing tickets via `listMyTickets`.
- Card per ticket: photo thumb, category, address, submitted date.
- **Pizza Tracker**: 4-step horizontal stepper (Submitted → Received → In Progress → Resolved) with filled/active/pending states.
- Expand: chronological `public_note` entries from `ticket_updates_public` with staff name + timestamp.
- Live updates via `supabase.channel` subscribed to both tables filtered by `user_id`.

## Part 3 — Staff Kanban Dashboard

**`/staff/dispatch`** (`src/routes/_authenticated/staff/dispatch.tsx`)
- Add `page.dispatch_311` to `PAGE_PERMISSIONS` in `src/lib/staff-permissions.ts`; gate route + sidebar entry.
- Sidebar link "311 Dispatch" in `event-ops-sidebar.tsx`.
- `listDispatchTickets` server fn (`requireSupabaseAuth` + staff guard): filters by `assigned_department_id ∈ user's departments` (admins see all). RLS enforces the same as defense-in-depth.
- **Kanban**: 4 columns by status; card shows category icon, short description, address, age, photo thumb. Drag-and-drop changes status by writing a `ticket_updates` row with `status_change`.
- Filters: category, department (admin only), date range, text search. Toggle to flat datatable view.

**Ticket detail drawer**
- Photo (full size), description, requester name/contact, category, address.
- **Map**: Google Static Maps via gateway (`/maps/api/staticmap`) — proxied through a small server fn to attach connector headers, returned as a data URL or piped image route.
- Updates timeline: status changes + both note types (staff see internal too).
- **Update form**: status select, public note textarea, internal note textarea → `addTicketUpdate` server fn writes one `ticket_updates` row; DB trigger propagates `status_change`.
- Realtime subscription so concurrent staff see updates live.

## Files added / edited

```text
supabase-migrations/046_tickets_311.sql          (new)
src/lib/tickets.functions.ts                     (new)
src/lib/tickets-public.functions.ts              (new: listIssueCategories)
src/lib/tickets-staff.functions.ts               (new)
src/lib/tickets-admin.functions.ts               (new: manage categories)
src/components/tickets/PizzaTracker.tsx          (new)
src/components/tickets/TicketCard.tsx            (new)
src/components/tickets/TicketKanban.tsx          (new)
src/components/tickets/TicketDetailDrawer.tsx    (new)
src/components/tickets/LocationPicker.tsx        (new)
src/routes/report.tsx                            (new public route)
src/routes/_authenticated/hub.tsx                (edit: My Reports tab)
src/routes/_authenticated/staff/dispatch.tsx     (new)
src/components/event-ops-sidebar.tsx             (edit)
src/components/site-header.tsx                   (edit: "Report an Issue" link)
src/lib/staff-permissions.ts                     (edit)
src/routes/manual.tsx                            (edit: document module)
```

## Out of scope
- Anonymous ticket submission.
- SMS/email notifications on status change (can layer on existing communications module later).
- SLA timers, escalation rules, duplicate detection, public ticket map.
