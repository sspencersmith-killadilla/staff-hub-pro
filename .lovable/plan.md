# Quest Reporting (3 surfaces) + Module Toggle + Docs

Expand the previous plan with full module on/off control and documentation updates.

## A. Module toggle — make Civic Quests switchable

Add `civic_quests` as a first-class platform module so admins can disable the entire feature.

- **Migration** `supabase-migrations/045_civic_quests_module.sql`:
  ```sql
  insert into public.platform_modules (key, label, description, enabled)
  values ('civic_quests', 'Civic Quests & Discovery',
          'Gamified self-guided adventures: badges, points, QR/geo waypoints, and leaderboard.', true)
  on conflict (key) do nothing;
  ```
- **`src/lib/platform-modules.functions.ts`** — add `"civic_quests"` to `ModuleKey` union, `DEFAULT_MODULES`, and the seed array.
- **`src/hooks/use-modules.ts`** — add `civic_quests: true` to defaults.
- **Gate every quest surface** with `isEnabled("civic_quests")`:
  - `/explore` (index + `$questId`) → render module-disabled stub when off.
  - `/leaderboard` (new) → same gate.
  - `/staff/quests-report` (new) → hide nav card + return module-disabled stub.
  - `/staff/admin/quests` → hide from admin nav when off.
  - `/hub` Quest Badges strip → tag the action with `module: "civic_quests"` so existing `visible()` filter hides it.
  - "Civic Quests" card in `doActions` on `/hub` already needs `module: "civic_quests"` added.
- **Server-fn guard** — add a shared `requireModule("civic_quests")` check at the top of every quest server fn (`listActiveQuests`, `getQuest`, `recordWaypointCompletion`, `listMyEarnedQuests`, `getLeaderboard`, all `staff*` quest fns). Returns a typed `{ disabled: true }` shape so the UI can render the stub even if called directly. Uses existing `src/lib/require-module.ts` pattern if present, otherwise add it.

## B. Three reporting surfaces (unchanged from prior plan)

1. **Public leaderboard** at `/leaderboard` — top 100 by points, "your rank" pill, podium for top 3. Server fn `getLeaderboard` in `src/lib/leaderboard.functions.ts`.
2. **Staff quest reporting** at `/staff/quests-report` — per-quest stats table, waypoint funnel drawer, CSV export. New permission `page.quests_report` added to `PAGE_PERMISSIONS`.
3. **Per-quest social-proof line** on `/explore/$questId` — "127 explorers completed this · 38 in progress".

All three respect the module toggle from section A.

## C. Documentation updates

- **`src/routes/manual.tsx`** — add a new "Civic Quests & Discovery" section (group id `civic-quests`) covering:
  - Resident flow: discovering quests, completing waypoints (QR / geo / honor system), earning badges and points, leaderboard, hub badges strip.
  - Staff/admin flow: creating quests, adding waypoints, printing QR codes, viewing the new staff reports, CSV export.
  - Module toggle: where to enable/disable in Admin → Platform Modules.
  - Register the new section id in the `groups` array.
  - Add a screenshot asset import `src/assets/manual/quests.png` (placeholder generated via imagegen).
- **`README.md`** — add `civic_quests` to the modules list, document the `/explore`, `/leaderboard`, and `/staff/quests-report` routes, and note the new permission key.
- **`REPRODUCTION.md`** — add migration `045` to the migration order list and note any seed steps.
- **`.lovable/plan.md`** — append the completed module + reporting work.
- **`build-your-own-community-events-platform.pdf`** — out of scope (binary asset, regenerated separately).

## Technical notes

- All new server fns return plain DTOs; admin-elevated reads use `await import('@/integrations/supabase/client.server')` inside handlers.
- Public leaderboard + per-quest stats use `supabaseAdmin` with explicit safe-column projection; no new `TO anon` policies.
- Staff routes use `requireSupabaseAuth` + `assertPermission('page.quests_report')` (admin bypass already built in).
- Loaders use `ensureQueryData` + `useSuspenseQuery`; every new route defines `errorComponent` and `notFoundComponent`.
- No quest-schema migration required beyond the module seed (existing `quests`, `quest_waypoints`, `user_quest_progress`, `profiles.points` are sufficient).
- CSV is generated in-memory by the server fn and returned as a string → client wraps in a Blob for download.

## Files

Created:
- `src/routes/leaderboard.tsx`
- `src/routes/_authenticated/staff/quests-report.tsx`
- `supabase-migrations/045_civic_quests_module.sql`
- `src/assets/manual/quests.png`

Edited:
- `src/lib/leaderboard.functions.ts` (add `getLeaderboard`)
- `src/lib/quests.functions.ts` (add staff stats/funnel/CSV + public stats + module guard on all fns)
- `src/lib/platform-modules.functions.ts` (add `civic_quests`)
- `src/hooks/use-modules.ts` (add default)
- `src/lib/staff-permissions.ts` (add `page.quests_report`)
- `src/routes/explore.index.tsx` + `src/routes/explore.$questId.tsx` (module gate + stat line)
- `src/routes/_authenticated/hub.tsx` (module-gate quest card + leaderboard link)
- `src/routes/_authenticated/staff/admin.tsx` (link card to quests report; hide quests admin when module off)
- `src/routes/manual.tsx` (new section + group registration)
- `README.md`, `REPRODUCTION.md`, `.lovable/plan.md`
