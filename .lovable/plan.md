# Granular Staff Permissions

Add per-feature access control for staff users, with **global defaults** that apply across all events plus optional **per-event overrides** for finer control.

## Permission catalog

A fixed set of string keys, one per gated surface:

**Sidebar pages** (global only — these aren't event-scoped):
- `page.box_office`
- `page.attendees`
- `page.events_list`
- `page.scanner`
- `page.reports`
- `page.settings`

**Event dashboard tabs** (can be global or per-event):
- `event.overview`
- `event.box_office`
- `event.marketing`
- `event.ticketing`
- `event.vendors`
- `event.volunteers`
- `event.reports`
- `event.attendees`
- `event.waitlist`
- `event.scanner`
- `event.settings`

(Final list will mirror the actual tab keys in `events.$id.tsx` and pages in `event-ops-sidebar.tsx`.)

Admins implicitly have `*` (all permissions). Plain `staff` role gets nothing by default — permissions are additive grants.

## Schema

Two tables, both in a new migration:

```text
staff_permissions
  id uuid pk
  user_id uuid  -> auth.users
  permission text          -- e.g. 'event.box_office'
  unique (user_id, permission)

staff_event_permissions
  id uuid pk
  user_id uuid  -> auth.users
  event_id uuid -> events
  permission text
  granted boolean          -- true = grant override, false = revoke override
  unique (user_id, event_id, permission)
```

Resolution per (user, event, permission):
1. Admin → allow
2. Per-event row exists → use its `granted` value
3. Global row exists → allow
4. Otherwise → deny

Both tables: RLS on, `service_role` full access, `authenticated` can `SELECT` only their own rows. All writes go through admin-only server functions using `supabaseAdmin`.

## Server layer (`src/lib/staff-permissions.functions.ts`)

- `getMyPermissions()` — returns `{ global: string[], perEvent: Record<eventId, { grant: string[], revoke: string[] }>, isAdmin: boolean }` for the current user.
- `hasPermission(userId, permission, eventId?)` — server-side resolver used by other protected functions.
- `listStaffWithPermissions()` (admin) — for the management UI.
- `setGlobalPermissions(userId, permissions[])` (admin).
- `setEventPermissions(userId, eventId, grants[], revokes[])` (admin).

Extend `staff-guard.ts`: replace bare `assertStaff` calls in sensitive server fns with `assertPermission(permission, eventId?)` that throws 403 when the resolver denies.

## Client layer

- `usePermissions()` hook wrapping `getMyPermissions` via `useQuery` (cached, invalidated on auth change).
- Helper `can(permission, eventId?)` exposed from the hook.
- `src/components/event-ops-sidebar.tsx` — filter the nav list with `can('page.X')`.
- `src/routes/_authenticated/staff/events.$id.tsx` — filter the tab list (and default selected tab) with `can('event.X', eventId)`.
- Route-level guard: each protected staff route adds a `beforeLoad` (or inline check in the component) that redirects to a "No access" view if the relevant permission is missing, so deep links can't bypass the sidebar filter.

## Admin UI

New page `src/routes/_authenticated/staff/admin/permissions.tsx` (admin-only):

- Table of staff users (from `user_roles` where role = 'staff').
- Row click → drawer with two tabs:
  - **Global** — checkbox grid of all permissions.
  - **Per-event** — event picker + checkbox grid where each permission has three states: inherit (use global), grant, revoke.
- Save calls `setGlobalPermissions` / `setEventPermissions`.

## Migration order

1. Create migration with both tables + RLS + grants.
2. Add server functions and update `staff-guard`.
3. Add hook and wire sidebar + event tabs.
4. Add admin permissions page.
5. Backfill: grant all existing staff users every permission globally, so current behavior is preserved until an admin tightens access.

## Out of scope

- Editing the permission catalog from the UI (it stays code-defined).
- Time-bound or role-templated permissions (could come later as "permission groups").
