# Program Guide Generator

A new admin tool that compiles approved events + StreetBeats performances within a date range into a print-ready PDF, with sponsor ad slots monetized through a new "Guidebook Ad Space" sponsorship tier.

## What gets built

### 1. New sponsorship tier: "Guidebook Ad Space"
- Add a seeded tier row (name `Guidebook Ad Space`, configurable price, `placement = 'guidebook'`) to the existing `sponsorship_tiers` table — schema migration only if a `placement` column is missing.
- Surface it in the public sponsor application form alongside existing tiers; sponsor uploads logo + promotional text (existing `logo_url`, new `ad_copy` text field on `sponsors`).
- Approval/payment flow is unchanged — re-uses the existing `ApplicationManager` UI.
- Only sponsors with `status in ('approved','paid')` and the guidebook tier appear in the PDF.

### 2. Server function: `generateGuidebook`
- Lives in `src/lib/guidebook.functions.ts` (NOT a Supabase Edge Function — per project rules we use `createServerFn` on TanStack Start; the user's phrasing "Supabase Edge Function" is taken to mean "server-side function").
- Guarded by admin role check (re-uses `staff-guard`).
- Inputs: `startDate`, `endDate`, optional `departmentId` filter.
- Queries (via `supabaseAdmin`):
  - `sessions` where `status='approved'` and `start_time` in range, joined with venue/room/stage + department.
  - StreetBeats `slots` in range joined with stage → venue → department, plus claimed artist.
  - Approved guidebook sponsors with logo + ad copy.
- Returns a PDF as a base64 string (or streams bytes) for the browser to download.

### 3. PDF layout (print-ready)
Generated server-side with `pdf-lib` (Worker-compatible, pure JS — `reportlab`/`puppeteer`/`sharp` are not usable in the Cloudflare Worker runtime).
- **Cover page**: event window dates, organization branding, hero sponsor logo.
- **Section headers** per day (and per department within each day).
- **Event entries**: title, time, venue/room, short description.
- **StreetBeats section**: grouped by stage, lists gigs with artist name + genre.
- **Sponsor ad slots**: full-page ad after the cover, half-page ads interleaved every ~N pages, footer micro-ads on content pages. Sponsors are rotated round-robin so each gets fair placement.
- Page numbers + footer.

### 4. Admin UI: "Generate Guidebook"
- New route `src/routes/_authenticated/staff/admin.guidebook.tsx` (admin-only via `beforeLoad` role check, mirroring `staff/settings.tsx`).
- Linked from the admin sidebar.
- Form: date range picker, optional department filter, "Generate PDF" button.
- On click → calls `generateGuidebook` server fn → triggers browser download of `program-guide-{start}-{end}.pdf`.
- Shows count preview ("X events, Y gigs, Z sponsor ads") before generation.

## Technical details

**Files created**
- `src/lib/guidebook.functions.ts` — `generateGuidebook` server fn + `previewGuidebookCounts` helper.
- `src/lib/guidebook-pdf.server.ts` — pure PDF builder using `pdf-lib`.
- `src/routes/_authenticated/staff/admin.guidebook.tsx` — admin UI.
- `supabase-migrations/025_guidebook_sponsor_tier.sql` — seed `Guidebook Ad Space` tier, add `ad_copy text` to `sponsors`, add GRANTs.

**Files edited**
- `src/lib/vendor-portal.functions.ts` / sponsor application form — accept `ad_copy` field when the guidebook tier is selected.
- `src/routes/_authenticated/staff/admin.tsx` (or sidebar) — add "Generate Guidebook" link.
- `package.json` — add `pdf-lib` dependency.

**Out of scope** (can be follow-ups)
- Emailing the PDF, archiving past guidebooks, multi-language layouts, sponsor self-service ad preview, paid ad-slot auction.

## Open questions

1. Should the guidebook respect the active department context (department admins generate just their section) or is it always all-departments for super admins only?
2. Fixed price for the Guidebook Ad Space tier, or should the admin set it when seeding?
3. Any branding assets (org logo, cover image) you want on the cover page, or should I use the platform default?
