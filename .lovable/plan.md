
# Municipal Sales Brochure (PDF)

A factual, design-forward, multi-page PDF brochure pitched to city managers, town clerks, parks & rec directors, and library directors — positioned as a single replacement for the patchwork of SaaS tools small municipalities currently pay for.

## Deliverable

A single PDF saved to `/mnt/documents/total-event-system-brochure.pdf`, generated with ReportLab (Python). Output as an artifact the user can download and share.

## Content outline (6 pages, letter size)

1. **Cover** — Bold wordmark, tagline ("One platform. Every department. Zero per-seat fees."), city silhouette motif, subtitle: "An open-source community event & operations platform for small cities, towns, and nonprofits."

2. **The problem** — Short factual block: most small municipalities juggle 6–10 separate SaaS tools (event ticketing, room booking, permit intake, vendor apps, email marketing, surveys, social scheduler, busker/gig program, class registration, public CMS). Each charges per seat or per transaction.

3. **One platform, every department** — Two-column feature matrix grouped by audience:
   - *Community*: events & ticketing, room reservations, class registration, StreetBeats busker program, community org events, vendor/sponsor applications, special-event permits, personal Hub, public department directory, civic quests (optional).
   - *Staff*: per-department workspaces, event ops, door scanner, approvals queues, reports, marketing hub.
   - *Admin*: granular permissions, multi-department tenancy, platform module toggles, branding engine, home page CMS, guidebook publisher, social command center, native email campaigns, surveys & analytics.

4. **What it replaces** — Side-by-side comparison table: "Typical municipal stack" (Eventbrite + SkedPal + Mailchimp + SurveyMonkey + Hootsuite + Wufoo + …, est. monthly cost) vs. "Total Event System" (one platform, $0 software cost, pay only for optional payment processing).

5. **Built on modern, durable tech** — Plain-language stack callout (React + Postgres + Cloudflare), runs at $0/month at small-city scale, open source under permissive license, five payment provider options (None / USAePay / Stripe / PayPal / Square), self-hosted or managed.

6. **Get started** — Three-step path (Fork the repo → Run the SQL migrations → Configure brand & departments), link to REPRODUCTION.md, footer with project URL.

## Visual direction

- Palette: **Navy Trust** (`#0f1b3d`, `#1e3a5f`, `#3b6fa0`, `#e8edf3`) with a single warm accent (`#d4842a`) for callouts — feels civic, trustworthy, not generic SaaS blue.
- Typography: Helvetica-Bold for headers (60–72pt on cover), Helvetica for body (10–11pt). Generous margins, strong grid.
- Visual motifs: thin rule lines, numbered section markers, small filled circles as bullets, a single hero stat per page ("1 platform replaces 8 tools", "$0/mo at small-city scale", "All 11 modules togglable per department").
- No stock-photo clichés. Geometric civic motif on cover (skyline silhouette as flat shapes).

## Technical approach

- Single Python script (`/tmp/brochure.py`) using ReportLab Platypus + Canvas.
- No external image dependencies — all visuals drawn as vector shapes.
- After generation: convert to images via `pdftoppm`, visually QA every page for overflow, overlap, alignment, and contrast. Iterate until clean.
- Emit `<presentation-artifact>` tag for the final PDF.

## Out of scope

- No code or schema changes to the app.
- No marketing copy claims that aren't backed by what's in `README.md` / `REPRODUCTION.md`.
- No pricing for the optional payment processors beyond the published rates already in the README.
