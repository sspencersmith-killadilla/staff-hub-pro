## Problem

`EventOpsSidebar` uses `hidden md:flex`, so on mobile (<768px) the entire staff/admin navigation disappears with no fallback. Staff and admin pages become unreachable from each other on a phone.

## Proposed Fix

Add a mobile-only navigation surface that exposes the same items as `EventOpsSidebar`, leaving the desktop sidebar untouched.

**Approach: hamburger menu at the top (recommended)**

1. In `src/routes/_authenticated/staff.tsx`, render a new `<StaffMobileNav />` component above `<Outlet />` that is only visible below `md`. The desktop `EventOpsSidebar` keeps its current `hidden md:flex` behavior.
2. Create `src/components/event-ops-mobile-nav.tsx`:
   - A sticky top bar (`md:hidden sticky top-0 z-40`) showing the "EVENT OPS" wordmark, active department badge, and a hamburger button.
   - Hamburger opens a `Sheet` (left side) that reuses the exact same `items` list, `isEnabled` / `can` filtering, admin link, "Back to App", and logout that `EventOpsSidebar` uses today.
   - Each link closes the sheet on navigation (`SheetClose asChild`).
3. Extract the shared `items` array and `ActiveDepartmentBadge` into a small shared module (e.g. `src/components/event-ops-nav-items.ts(x)`) so the sidebar and the mobile sheet stay in sync. No behavior change to the desktop sidebar beyond importing from the new file.

**Why hamburger over bottom tab bar:** the menu has 15+ entries gated by modules/permissions, which doesn't fit a fixed bottom tab bar cleanly. A sheet preserves the full list and matches the pattern already used in `site-header.tsx`.

## Out of scope

- No changes to the public `SiteHeader` hamburger.
- No changes to which items appear, their order, permissions, or styling on desktop.
- No new routes or backend work.

## Files touched

- `src/routes/_authenticated/staff.tsx` — render mobile nav above `<Outlet />`.
- `src/components/event-ops-sidebar.tsx` — import shared items list; no visual change.
- `src/components/event-ops-mobile-nav.tsx` — new.
- `src/components/event-ops-nav-items.tsx` — new shared items + badge.
