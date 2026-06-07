# Civic Quests & Discovery + Ticket Scanner Standardization

## Part 1 — Database (migration)

New migration `supabase-migrations/043_civic_quests.sql`:

- `quest_completion_type` enum: `qr_scan`, `geo_location`, `honor_system_button`
- `public.quests` — `id`, `department_id`, `title`, `description`, `badge_image_url`, `is_active` (default false), `points_reward` (int default 0), timestamps
- `public.quest_waypoints` — `id`, `quest_id` (cascade), `title`, `description`, `completion_type`, `secret_code` nullable, `lat`/`lng`/`radius_m` nullable, `sort_order`
- `public.user_quest_progress` — `id`, `user_id` (cascade, NOT NULL), `quest_id`, `completed_waypoints jsonb default '[]'`, `is_completed bool`, `completed_at`, unique `(user_id, quest_id)`
- `public.profiles.points int not null default 0` (new column for future leaderboard)
- GRANTs + RLS:
  - `quests`/`quest_waypoints`: SELECT for anon+authenticated where `is_active` (waypoints joined via quest); admin writes via `has_role`.
  - `user_quest_progress`: row scoped to `auth.uid()`; INSERT requires `user_id = auth.uid()`.
  - `profiles.points`: existing RLS unchanged; writes only via server fn using `supabaseAdmin`.
- `secret_code` never selectable by anon/authenticated — public listing server fn projects explicit columns and omits it.

## Part 2 — Admin Quest Builder

- Route: `src/routes/_authenticated/staff/admin.quests.tsx` (added to admin nav).
- `src/lib/quests.functions.ts` — admin CRUD via `requireSupabaseAuth` + `has_role(...,'admin')` check; uses `supabaseAdmin` internally.
- Datatable: title, department, status, waypoint count, actions.
- Builder: quest fields + reorderable waypoint list. Per waypoint type:
  - `qr_scan`: auto-generate `secret_code` (nanoid) on save; render printable QR via `qrcode` encoding exactly `quest_{waypoint_id}_{secret_code}`. Print view shows title + QR.
  - `geo_location`: lat/lng/radius inputs.
  - `honor_system_button`: no extra config.
- Deps: `bun add qrcode @types/qrcode`.

## Part 3 — Public `/explore`

- Discovery: **direct URL / hub only** — no header nav link. Add a "Civic Quests" card on `/hub` that links to `/explore`.
- Routes:
  - `src/routes/explore.index.tsx` — adventure-log grid of active quests (public server fn, no secrets).
  - `src/routes/explore.$questId.tsx` — quest detail + waypoint progress. Signed-out users see "Sign in to track progress" CTA (no redirect, per public-route rules).
- Waypoint completion via server fn `completeWaypoint({ raw, questId })`:
  - `qr_scan`: parse `quest_{waypoint_id}_{secret_code}`; server validates secret with `supabaseAdmin`.
  - `honor_system_button`: confirm → server fn (no secret check).
  - `geo_location`: pass user coords; server validates haversine ≤ `radius_m`.
  - On any completion: append waypoint to `completed_waypoints`; if all done set `is_completed=true`, `completed_at=now()`, and increment `profiles.points` by `points_reward` (idempotent — only on the transition to completed).
- Scanner uses existing `@yudiel/react-qr-scanner` in a modal.
- Success: `canvas-confetti` burst + sonner toast. Deps: `bun add canvas-confetti @types/canvas-confetti`.
- Hub badges: extend `src/routes/_authenticated/hub.tsx` to render earned badges (badge_image_url + title) and current `profiles.points` total.

## Part 4 — Standardize Staff Ticket Scanner

- Ticket QR generation sites (search `my-tickets.tsx` and any ticket QR render) → emit `ticket_{ticket_id}`.
- `src/routes/_authenticated/staff/attendees.tsx` — update `handleScan` + `handleManual`:
  - If input `startsWith("quest_")` → red toast `"Invalid Ticket Format"`.
  - If `startsWith("ticket_")` → strip prefix, run existing check-in.
  - **Legacy bare-ID fallback for N days**: add `LEGACY_TICKET_CUTOFF` constant (set to today + 30 days) in the route. Until that date, bare UUIDs are still accepted and a yellow warning toast logs "Legacy ticket format — re-issue soon". After the cutoff, bare IDs are rejected with the standard red toast.

## Part 5 — Leaderboard groundwork (no UI yet)

- `profiles.points` column added in Part 1.
- Server fn stub `src/lib/leaderboard.functions.ts` with `getTopPoints({ limit })` returning `{user_id, display_name, points}` ordered desc — wired but not yet rendered. Documented in plan for a future `/explore/leaderboard` route.

## Technical notes

- All secret validation, progress writes, and `profiles.points` increments happen server-side; clients never see `secret_code`.
- Admin gating uses existing `has_role(auth.uid(),'admin')`.
- Public loaders call public server fns (admin-elevated, projected columns) — never `requireSupabaseAuth` from public routes.
- Confetti and QR libs imported only inside client components.
