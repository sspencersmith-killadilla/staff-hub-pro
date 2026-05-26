## Goals

1. **Community organizations can upload + focal-point an event image** (today the form has no image field at all, even though `image_url` exists on the row).
2. **Replace the "More info" link-to-raw-image** for community events with a proper flyer page at `/community-events/$id` (parallel to `/artists/$id`).
3. **Floorplan editor** in the staff event dashboard: add a UI to upload/set the background image (the data model already supports `mapData.backgroundImage`, the UI is just missing).

---

## 1. Community event image + focal point

**Schema** — new migration `011_community_event_image_focal.sql`:
- Add `image_focal_x smallint default 50 check (0..100)` and `image_focal_y smallint default 50 check (0..100)` to `events` (cohabits with the existing `focal_x` / `focal_y` used by city sessions — separate columns to avoid mixing the two domains, or reuse `focal_x`/`focal_y` on events if they already exist there; check during build).

**Server** (`src/lib/community-public.functions.ts`):
- Add `image_url`, `image_focal_x`, `image_focal_y` to `eventInput` zod schema (URL optional, focal 0-100).
- Persist them in `createMyCommunityEvent` / `updateMyCommunityEvent`.
- Add them to `EVENT_COLS`, `eventRow`, and `hydrate` so the public listing returns them.

**Form** (`src/routes/_authenticated/community/manage.tsx` → `EventForm`):
- Add an "Event image URL" input.
- Below it, when a URL is present, render `<ImageFocalPicker>` (existing component) bound to focal state.
- Submit the three fields with the event payload.

**Public listing** (`src/routes/events.index.tsx`):
- Use `image_focal_x` / `image_focal_y` on community event cards (currently only city `focal_x/y` is used).

---

## 2. Community event flyer page

**New route** `src/routes/community-events.$id.tsx` — mirrors `src/routes/artists.$id.tsx`:
- Loader calls a new public server fn `getPublicCommunityEvent({ id })` in `community-public.functions.ts` that returns the event + org info (only if approved).
- Layout: hero image (cropped using focal point), title, date/time, location, hosted-by org with website link, description, cost, public contact. No raw-image link.
- `head()` sets title/description/og:image from the event.
- `notFoundComponent` + `errorComponent` per template rules.

**Events index** (`src/routes/events.index.tsx`):
- Replace the `e.source === "community" && e.image_url` raw-image `<a>` with a `<Link to="/community-events/$id" params={{ id: e.id }}>More info</Link>` whenever source is community (image or not).

---

## 3. Floorplan background image upload

**Component** (`src/components/RobustMap.tsx`):
- In the left toolbar's "select" mode panel, add a new section "0. Floor plan background":
  - "Image URL" input bound to local state.
  - "Use image" button → updates a new local `bgUrl` state, which feeds the existing `bgImage` loader effect.
  - "Remove background" button → clears it.
- Track the URL in component state initialized from `mapData.backgroundImage`; pass it into `handleSave` instead of reading from stale `mapData`.
- Optional: a file picker that reads the file as a data URL (kept simple — no storage bucket needed, since `interactive_map_data` is JSON and data URLs work; we'll cap to ~2MB and warn otherwise). Default plan: **URL input first**, with a note that they can paste any image URL (most users already host their floorplan PDF/image). We'll skip raw file upload to avoid bloating the JSON column.

No schema changes — `interactive_map_data.backgroundImage` already exists.

---

## Files touched

- `supabase-migrations/011_community_event_image_focal.sql` *(new)*
- `src/lib/community-public.functions.ts`
- `src/routes/_authenticated/community/manage.tsx`
- `src/routes/events.index.tsx`
- `src/routes/community-events.$id.tsx` *(new)*
- `src/components/RobustMap.tsx`

---

## Open question

For the floorplan background, do you want a **URL paste** (simple, instant, no storage cost) or a **file upload** (needs a Supabase storage bucket + RLS — more work, but no hosting required from the organizer)? Default to URL paste unless you say otherwise.
