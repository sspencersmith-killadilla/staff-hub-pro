# Make "everything at the Library" a real public view

## Problem

A public visitor who wants to see only what the Library offers has no single page that shows it. `/hub` is auth-only (the manual is wrong about that), `/departments/<id>` shows events + rooms + gigs but not classes, and there is no public list of departments to pick from.

## Goal

A visitor can land on the site, click "Departments", pick **Library**, and see — on one page — Library events, classes, rooms, and gigs. No login required.

## Changes

### 1. Add a Classes section to the public department hub

File: `src/routes/departments.$id.tsx` + `src/lib/departments.functions.ts`

- Extend `getDepartmentHub` to also fetch upcoming/active classes for the department by calling the existing `courses-public` query path (filter `courses.department_id = <id>`, only published, future or open-enrollment).
- Add `"classes"` to `ALL_SECTIONS` in the route so it joins events / gigs / rooms in the customizable layout, with its own header (icon: `GraduationCap`), empty state, and card grid linking to `/classes/$id`.
- Respect the existing `useLayoutPrefs` show/hide/reorder controls.

### 2. Public departments index

New file: `src/routes/departments.index.tsx` → URL `/departments`

- Public route, SSR-friendly, with `head()` meta ("Departments — browse by city department").
- Loader calls a new `listPublicDepartments` server fn in `src/lib/departments.functions.ts` returning `id, name, logo_url, short_description` for departments that have at least one public-facing item (event, class, or bookable room).
- Renders a responsive card grid; each card links to `/departments/$id` using `<Link to="/departments/$id" params={{ id }}>`.

### 3. Header + home wayfinding

- `src/components/site-header.tsx`: replace the single hard-coded department link with a "Departments" link to `/departments`.
- `src/components/home/HomePageView.tsx` (light touch only — presentation): add a "Browse by department" entry point on the home page so a Library visitor has an obvious door in.

### 4. Manual correction

File: `src/routes/manual.tsx`

- In the `departments-overview` / `dept-hub` sections, correct the claim that the public uses `/hub`. State explicitly:
  - `/hub` is the **signed-in** personal dashboard.
  - `/departments` is the **public** department directory.
  - `/departments/<id>` is the **public** department hub showing that department's events, classes, rooms, and gigs.
- Add a one-line example: "To see only Library offerings, go to `/departments` and pick **Library**."
- Update the section's screenshot caption if needed; reuse the existing `quests.png` pattern (no new asset required unless you want one).

## Out of scope

- No schema changes. `courses.department_id`, `events.department_id`, and `venues.department_id` already exist.
- No changes to the auth-gated `/hub`.
- No changes to the Civic Quests module or reporting surfaces.

## Technical notes

- `listPublicDepartments` uses `supabaseAdmin` with an explicit safe column projection (`id, name, logo_url, short_description`); no new `TO anon` grants.
- Classes query in `getDepartmentHub` mirrors the filter logic already in `listPublicCourses` so behavior stays consistent between `/classes?dept=…` and `/departments/<id>`.
- New routes define `errorComponent` and `notFoundComponent`; loader uses `ensureQueryData` + `useSuspenseQuery`.
- All new links use `<Link to="/departments/$id" params={{ id }}>` — never `<a href>`.

## Files

Created:
- `src/routes/departments.index.tsx`

Edited:
- `src/lib/departments.functions.ts` (add classes to hub payload, add `listPublicDepartments`)
- `src/routes/departments.$id.tsx` (render Classes section)
- `src/components/site-header.tsx` (Departments nav link)
- `src/components/home/HomePageView.tsx` (entry point card — presentation only)
- `src/routes/manual.tsx` (correct public vs. authenticated hub wording)
