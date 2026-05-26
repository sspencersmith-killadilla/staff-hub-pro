## Goal

Let admins pick the "best spot" of an event image so the events page card crops around that point instead of always centering.

## How it works

- Store a focal point per event as two numbers (x %, y %), default 50/50 (center).
- On the events page, render each image with `object-fit: cover` plus `object-position: <x>% <y>%`. No layout changes, just smarter cropping.
- In the staff event editor, add a small focal-point picker: shows the image and a draggable dot. Clicking/dragging sets the x/y. Saved with the rest of the form.

Same treatment for community events (since both flow into the unified events feed).

## Changes

### Database (migration)
- Add `focal_x smallint default 50` and `focal_y smallint default 50` to `sessions` (city events) and `events` (community).
- Backfill is automatic via default.

### Server functions
- `src/lib/events.functions.ts`: add `focal_x` / `focal_y` to the zod schema and insert/update payload.
- `src/lib/community.functions.ts`: same for community submissions/edits.
- `src/lib/events-public.functions.ts`: include `focal_x` / `focal_y` in the `UnifiedEvent` returned by `listPublicAllEvents` (city sessions + community events). Music gigs keep default 50/50.

### UI
- New component `src/components/image-focal-picker.tsx`: shows the image, overlays a draggable crosshair, emits `{x, y}` on change. Used by both staff event form and community manage form.
- `src/routes/_authenticated/staff/index.tsx`: add focal picker under the existing "Image URL (Poster)" input; wire to `form.focal_x` / `form.focal_y`.
- `src/routes/_authenticated/community/manage.tsx`: same picker on the community event form.
- `src/routes/events.index.tsx`: on the `<img>` at line ~302, add `style={{ objectPosition: \`${e.focal_x ?? 50}% ${e.focal_y ?? 50}%\` }}`.

### Not changed
- Music gig images (busker avatars) stay centered — no editor surface for them.
- No image processing; the original file is untouched, only the CSS crop anchor changes.

## Out of scope
- Auto/AI focal detection (you picked admin-set).
- Cropping/resizing the original file.

Confirm and I'll implement.