# Auto-generate fallback images for submissions

Goal: when a user creates/edits an event, community event, course, gig, venue, room, vendor, or sponsor without uploading or pasting an image URL, the system generates one from the item's title/description and stores it just like an uploaded image. The user can still replace it later.

## Approach

1. **Server helper** — `src/lib/auto-image.server.ts`
   - `generateFallbackImage({ kind, title, description, extra })` → returns a public URL.
   - Calls Lovable AI Gateway `/v1/images/generations` with `openai/gpt-image-2`, `quality: "low"`, non-streaming (we just need the final PNG server-side).
   - Builds a concise prompt per kind (e.g. event flyer, course thumbnail, venue hero, vendor booth, gig poster) using the item's title + short description.
   - Uploads the returned base64 PNG to a public Supabase Storage bucket (`auto-images`, created via migration) at `{kind}/{id-or-uuid}.png` using `supabaseAdmin`.
   - Returns `publicUrl`.
   - Wraps everything in try/catch: on failure (rate limit, content policy, network), returns `null` so the submission still succeeds — image just stays empty.

2. **Wire into mutation server functions** — only when the incoming `image_url` is null/empty:
   - `events.functions.ts` → `upsertEvent`
   - `community.functions.ts` → community event submit / update
   - `courses.functions.ts` → `upsertCourse`
   - `streetbeats.functions.ts` → `createGig` / `updateGig` (if gigs carry an image; otherwise skip)
   - `venues.functions.ts` → `upsertVenue`, `updateRoom`
   - `vendor-portal.functions.ts` / `vendor-staff.functions.ts` → vendor + sponsor submissions
   - Pattern: after the row is inserted (so we have the id), if `image_url` is still empty, call `generateFallbackImage`, then `update ... set image_url` on that row. Done async-but-awaited inside the handler so the returned record already has the image; UI sees it on the first render.

3. **Migration** — `supabase-migrations/037_auto_images_bucket.sql`
   - `insert into storage.buckets ('auto-images', public)`
   - Public read policy; insert/update/delete restricted to `service_role` (only the admin client writes here).

4. **Secrets / config**
   - Requires `LOVABLE_API_KEY` (already managed by Lovable AI Gateway). If missing, I'll run `lovable_api_key--create` before shipping.

5. **UX note** — no UI changes required; existing ImageUploader still works. Optionally we can show a small "auto-generated" caption on cards, but not in scope unless you want it.

## Open questions before I build

1. **Which entities are in scope?** I listed events, community events, courses, gigs, venues, rooms, vendors, sponsors. Want all of them, or a subset (e.g. just events + community events + courses)?
2. **Sync vs background?** Generating an image adds ~3–8s to the save call. Two options:
   - (a) **Sync** — save waits until the image is generated; user sees it immediately. Simpler.
   - (b) **Async** — return the saved row instantly with no image, kick off generation in the background, image appears on next refresh. Needs a small job table or fire-and-forget pattern in the Worker.
3. **Style** — one consistent look across all auto-images (e.g. "minimal flat illustration on a brand-colored background") or kind-specific (event = flyer, venue = architectural render, vendor = product shot)?

Once you confirm those three, I'll implement.
