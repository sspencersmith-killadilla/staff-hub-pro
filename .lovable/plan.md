## Goal

Replace the current `sessionStorage` staff password with real Supabase email/password auth, add an `admin` vs `staff` role system, expand venue/room data (address, features, weekly hours, holiday closures) and surface it publicly, give vendors/sponsors real accounts with passwords, and add logout + "Home" links across the app.

The plan targets the uploaded Next.js codebase (`totaleventsystemsolutions-main/`) and the existing Supabase project (schema from `schema.txt`).

---

## 1. Database changes (Supabase migrations)

### 1a. Role system (replace `profiles.is_staff` boolean)

```sql
create type public.app_role as enum ('admin', 'staff', 'vendor', 'sponsor', 'musician');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create or replace function public.is_staff_or_admin(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id=_uid and role in ('staff','admin')
  )
$$;
```

Backfill: insert `('admin')` rows for each `profiles.id` where `is_staff = true` (you choose who becomes admin), the rest get `('staff')`. Keep `profiles.is_staff` for now, drop after cutover.

### 1b. Venues, stages, rooms — richer info + hours + closures

```sql
-- Stages: add address-ish fields and features (stages currently only has name/description/address/map)
alter table public.stages
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists features jsonb default '{}'::jsonb, -- power, shade, backline, green_room, ...
  add column if not exists capacity integer,
  add column if not exists load_in_notes text,
  add column if not exists image_url text;

-- Rooms: richer info (already has amenities jsonb + open_hours jsonb)
alter table public.rooms
  add column if not exists description text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists image_url text,
  add column if not exists features jsonb default '{}'::jsonb;

-- Weekly operating hours — applies to rooms, stages, and venues uniformly
create table public.operating_hours (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('room','stage','venue')),
  entity_id uuid not null,                -- venues uses integer; see note below
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Sun
  opens time,
  closes time,
  is_closed boolean default false,
  unique (entity_type, entity_id, day_of_week)
);

-- Holiday / one-off closures
create table public.closures (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('room','stage','venue')),
  entity_id uuid not null,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz default now()
);
```

Note: `venues.id` is `integer` and `rooms.id`/`stages.id` are `uuid`. Two clean options — pick one in build:
- Store `entity_id` as `text` and cast at query time (simpler, one table).
- Or migrate `venues.id` to `uuid` (cleaner, more work; updates FKs in `slots`-style joins if any).
Recommend: `text` for `entity_id` to ship faster.

### 1c. Vendors & sponsors get accounts

```sql
alter table public.vendors  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.sponsors add column if not exists user_id uuid references auth.users(id) on delete set null;
```

Vendors/sponsors will sign up via Supabase Auth (email + password). On approval, staff link `user_id`. They log in at `/login` and land on a vendor/sponsor dashboard scoped by `user_id`.

### 1d. RLS rewrites (the uploaded CSV shows wide-open policies — fix as part of this work)

For every table, drop policies like `Allow public reads/inserts/updates` and replace with:
- Public read: only what's intentionally public (approved events, approved sponsors/vendors logos, room/stage public info, operating hours, closures).
- Staff/admin write: `using (public.is_staff_or_admin(auth.uid()))`.
- Admin-only on `user_roles`: insert/update/delete gated by `has_role(auth.uid(),'admin')`.
- Vendors/sponsors: can read/update their own row where `user_id = auth.uid()`.

Tables to lock down (from the CSV): `attendees`, `events`, `organizations`, `profiles`, `rooms`, `room_classes`, `room_reservations`, `sessions`, `slots`, `sponsors`, `sponsorship_tiers`, `stages`, `talent`, `ticket_tiers`, `vendors`, `vendor_tiers`, `venues`, `volunteers`, `platform_settings`, plus the new `user_roles`, `operating_hours`, `closures`.

---

## 2. Auth & route protection

- Add `src/utils/supabase/server.ts` (server client using cookies) and middleware-based session refresh — currently `middleware.ts` only does subdomain rewrites. Extend it to also call `supabase.auth.getUser()` so server components have a session.
- Replace the `sessionStorage.getItem('mckinney_staff_authed')` gate in `src/app/dashboard/page.tsx` with a server check: if no session → redirect to `/login?redirect=/dashboard`; if session but no `staff`/`admin` role → render "Not authorized".
- Create `src/lib/auth.ts` with helpers: `getUserWithRoles()`, `requireStaff()`, `requireAdmin()`.
- Wrap protected routes (`/dashboard`, `/dashboard/event/*`, `/vendor` partner area, `/sponsors` partner area, room approval APIs, etc.) using these helpers.
- Existing `/login` page works for email+password; add a small "Forgot password" link and a `/reset-password` page using `supabase.auth.resetPasswordForEmail` + `updateUser({ password })`.

---

## 3. Admin staff-management UI

New tab in `/dashboard` called **Staff** (admin-only):
- List all users with `staff` or `admin` role: email, name, role, created date.
- "Invite staff" form — calls a server action that uses the **service role key** (server-only) to `supabaseAdmin.auth.admin.inviteUserByEmail(email)` and inserts a `user_roles` row with the chosen role.
- Promote/demote (toggle `admin` role).
- Remove staff — deletes the `user_roles` row(s) and optionally `auth.admin.deleteUser(id)`.
- Audit log table (optional): `staff_audit(id, actor_id, action, target_id, payload jsonb, created_at)`.

Server actions live in `src/app/dashboard/staff/actions.ts`; the page checks `requireAdmin()`.

---

## 4. Dashboard inputs — venues, stages, rooms

Extend the editors already in `src/app/dashboard/page.tsx`:
- **Stages editor**: add inputs for `address`, `city`, `state`, `zip`, `capacity`, `image_url`, `load_in_notes`, and a `features` checklist (power, shade, backline, green room, bathrooms, seating).
- **Rooms editor**: add `description`, `address`, `image_url`, `features` checklist; keep existing `amenities`.
- **Venues** (`public.venues`): already has address/features; expose them in the dashboard editor.
- Add a reusable **Weekly Hours editor** component: 7 rows (Sun–Sat) with `opens`, `closes`, and `closed` toggle → writes to `operating_hours`.
- Add a **Closures editor**: list + "Add closure" form (`start_date`, `end_date`, `reason`) → writes to `closures`.

---

## 5. Public surfaces

- `src/app/rooms/[id]/page.tsx`: render description, address, image, features, this-week's hours, and any upcoming closures. Booking form should refuse times outside hours / inside closures (validate in `/api/rooms/reserve`).
- `src/app/gig/[id]/page.tsx` and any stage/venue public pages: show address (with map link), features, capacity, load-in notes, and current operating hours.
- A shared `<VenueDetails entity_type entity_id />` server component to keep markup consistent.

---

## 6. Vendors & sponsors get passwords

- `/vendor-application` and `/sponsors/apply` (or wherever the current intake lives) add `password` + `confirm password`.
- On submit (server action): `supabase.auth.signUp({ email, password })`, then insert `vendors`/`sponsors` row with `user_id = data.user.id` and `status='pending_approval'`.
- New `/vendor/dashboard` and `/sponsors/dashboard` (auth-gated, role check `vendor`/`sponsor`) where they manage their own listing, logo, etc.
- Staff approval (existing flow) just flips `status` to `approved`.

---

## 7. Global nav: logout + home link on every page

- Replace the unused `src/components/header.tsx` (currently a "Next.js AI Lite" demo header) with a real `SiteHeader` server component:
  - Always shows **Home** link.
  - If signed in: shows email + **Log out** button (reuses existing `LogoutButton.tsx`) + a link to the relevant dashboard based on role.
- Render `<SiteHeader />` in `src/app/layout.tsx` so it appears on every page.
- Exception list: keep it off `/flyer/*` print pages (and any embed/QR pages) if desired.

---

## Out of scope / explicit non-goals

- Switching auth providers (Google/Apple) — staying with email + password as you asked.
- Payments changes.
- Migrating `venues.id` from `integer` to `uuid` (using `text` `entity_id` instead).

---

## Technical notes (for engineers)

- Use `@supabase/ssr` for cookie-based server auth in Next.js App Router; the current `src/utils/supabase/client.ts` covers the browser client only.
- Admin endpoints that need to create users (`auth.admin.*`) require `SUPABASE_SERVICE_ROLE_KEY`; keep it server-only.
- The CSV shows duplicate/conflicting policies on most tables (`Allow public reads`, `Public can update profiles`, etc.). Drop them all and recreate from scratch per table — partial fixes will keep the over-permissive policies in effect.
- `useEffect` + `sessionStorage` gating is being removed; do not also leave it as a fallback (it's bypassable).
- The current `middleware.ts` rewrites subdomains to `/tenant/<sub>`; preserve that and add the session-refresh step in the same handler.

---

## Suggested build order

1. Migrations: `user_roles` + `has_role`/`is_staff_or_admin`, `operating_hours`, `closures`, vendor/sponsor `user_id`, stage/room column additions.
2. RLS rewrite per table.
3. Server Supabase client + `requireStaff/requireAdmin` helpers + middleware session refresh.
4. Real `SiteHeader` (home + logout) wired into `layout.tsx`.
5. Replace dashboard `sessionStorage` gate with role check; add **Staff** admin tab.
6. Dashboard editors: stage/room/venue richer fields + weekly hours + closures.
7. Public pages: surface new fields, hours, closures; enforce on booking.
8. Vendor/sponsor signup with password + role-scoped dashboards.
9. Cleanup: drop `profiles.is_staff`.
