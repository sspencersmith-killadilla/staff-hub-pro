# Total Event System Solutions

An open-source, multi-tenant, multi-department community event & partnership platform. Built for **small cities, towns, and nonprofits** that want a complete event-management system without the per-seat SaaS bill.

Built on **TanStack Start** (React 19 + Vite 7), **Supabase** (Postgres + Auth + Storage + RLS), and **Cloudflare Workers** for SSR. Runs $0/month at small-city scale.

> **New to the project?** See [REPRODUCTION.md](./REPRODUCTION.md) — a soup-to-nuts, no-coding-required setup guide.

---

## What's in the platform

### For community members
- **Events & ticketing** — browse sessions, buy tickets (multiple payment providers supported), receive QR codes, manage waitlists, and check schedules per attendee seat.
- **Classes & courses** — multi-session class catalog with instructor pages and per-session enrollment.
- **Venues, stages & rooms** — public-facing venue pages with operating hours, focal-point images, and tag-based filtering.
- **Room reservations** — request meeting rooms, see availability calendars, track approval state.
- **StreetBeats** — register as a busker, apply for slots, claim and share gig flyers.
- **Community organizations & events** — HOAs, nonprofits, and schools join, manage members, and publish their own events.
- **Vendor & sponsor applications** — apply per-event (or standalone sponsorship packages) with documents and payment.
- **Special-event permits** — submit, attach documents, and track city permit applications.
- **311 Reports** — submit non-emergency citizen issues with category, photo, and location; track status from "My Reports".
- **Civic Quests & Discovery** — gamified self-guided adventures with QR scan, geo-location, or honor-system waypoints, badges, points, and a public leaderboard.
- **Prizes & Raffles** — redeem points in the prize shop, enter raffles, and view winners.
- **Favorites** — heart events, venues, artists, classes, and orgs; see them all in one place.
- **Artists & performers** — public artist profiles linked to sessions and gigs.
- **My Wallet / Personal Hub** — single hub showing tickets, applications, reservations, permits, reports, schedule, gigs, and favorites.
- **Public surveys** — anonymous feedback forms at `/survey/$id`.
- **Installable PWA** — manifest + service-worker-ready, installable on mobile and desktop.
- **Auth** — email/password, password reset, optional Google / Apple / GitHub OAuth.

### For staff
- **Per-department workspace** — sidebar scoped to your active department, switchable for super admins.
- **Event ops** — sessions, stages, attendees, door scanner, event dashboards, marketing hub, and per-event reports.
- **Box office** — ticket sales, seat assignment, waitlist promotion, refunds, and QR check-in.
- **Approvals queues** — vendor, sponsor, room reservation, community org, and special-event permit reviews.
- **311 Dispatch** — operator queue for incoming citizen reports with categories, assignment, and status updates.
- **Classes management** — courses, instructors, multi-session scheduling, rosters.
- **Community music** — StreetBeats applicants, gig calendar, flyer claims.
- **Community organizations** — review org applications, manage membership.
- **Communications** — TipTap email campaigns, audience segments, scheduled sends, open/click tracking, unsubscribe handling.
- **Surveys** — author/edit surveys, view per-question analytics with Recharts.
- **Social Command Center** — drag-and-drop calendar publishing to Facebook, Instagram, and LinkedIn via per-department OAuth.
- **Map view** — geospatial view of events, venues, and 311 reports.
- **Quests reporting & prize redemption** — quest completion reports and an in-person redemption console.
- **Per-event marketing hub** — auto-generated promo copy, image generation, and share links.

### For admins
- **Granular permissions** — page-level keys (`page.events`, `page.communications`, …) plus per-event grants/revokes; department roles override automatically.
- **Multi-department tenancy** — each department gets its own theme, modules, roles, sub-domain, and home page overrides.
- **Platform module toggles** — turn features on/off (events, box office, venues, classes, room reservations, community orgs, StreetBeats, vendors/sponsors, social command, guidebook, civic quests).
- **Branding engine** — colors, fonts, logos, favicons per tenant; pluggable AI-driven image generation for hero/auto images.
- **Homepage Content Editor** — editable hero, featured cards, prominence toggles, and tenant overrides.
- **Issue categories admin** — manage 311 category taxonomy.
- **Quest authoring** — quests, waypoints (QR / geo / honor), badge art, point rewards, prizes, and raffles.
- **Guidebook publisher** — magazine-style guidebook canvas editor with PDF export.
- **Tenants & departments admin** — create departments, assign owners, manage logos.
- **Email integration settings** — Resend domains, sender identities, and tracking.
- **Social integrations** — Meta (Facebook/Instagram) and LinkedIn OAuth app configuration.
- **Analytics** — built-in dashboards over events, attendance, vendors, campaigns, and quests.
- **Global settings** — site-wide defaults and feature flags.
- **Special-event permit admin** — review, approve, and track city permits.
- **Visual user manual** — in-app at `/manual`, audience-tagged for community / staff / admin.



---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start v1 (React 19, Vite 7) |
| Runtime | Cloudflare Workers (SSR via `nodejs_compat`); Vercel/Netlify/Render/Fly also supported |
| Database | Supabase Postgres with RLS |
| Auth | Supabase Auth (email/password + optional Google/Apple/GitHub OAuth) |
| Styling | Tailwind v4 (`src/styles.css`) + shadcn/ui |
| State | TanStack Query |
| Rich text | TipTap |
| Charts | Recharts v2 |
| Email | Resend (optional) |
| Image generation | Pluggable — OpenAI / Google Gemini / Stability AI (optional) |

---

## Payment options

The platform supports five payment configurations. Pick one. (See [REPRODUCTION.md §6](./REPRODUCTION.md#part-6--pick-a-payment-option-or-skip) for full instructions.)

| Option | Status | Pricing | Best for |
| --- | --- | --- | --- |
| **None** | Built-in | Free | Cities with only free events |
| **USAePay** | Wired up (`src/lib/usaepay.server.ts`) | Merchant-account based, low per-transaction | U.S. municipalities with existing merchant accounts |
| **Stripe** | Drop-in snippet | 2.9% + 30¢ | Easiest signup, global support |
| **PayPal** | Drop-in snippet | 3.49% + 49¢ | Existing PayPal users, no monthly fee |
| **Square** | Drop-in snippet | 2.6% + 10¢ (in-person) / 2.9% + 30¢ (online) | Cities already using Square for POS |

---

## Quick start (for developers who already have Node + Bun)

```bash
git clone <your-fork-url>
cd total-event-system
bun install
# edit src/integrations/supabase/config.ts with your Supabase URL + publishable key
bun dev          # http://localhost:8080
```

Then run all SQL files in `supabase-migrations/` against your Supabase project in numerical order.

Full beginner walkthrough: **[REPRODUCTION.md](./REPRODUCTION.md)**.

---

## Repo layout

```
src/
├── routes/                       # File-based routes (TanStack Router)
│   ├── __root.tsx                # Root layout / shellComponent
│   ├── index.tsx                 # Home (CMS-driven)
│   ├── _authenticated/           # Auth-gated subtree
│   │   └── staff/                # Staff dashboards
│   ├── api/public/               # Webhooks & cron (no auth)
│   ├── survey.$id.tsx            # Public anonymous survey form
│   ├── manual.tsx                # Full visual user manual
│   └── ...
├── lib/                          # Server functions (.functions.ts) and helpers
├── components/                   # Reusable UI (incl. shadcn/ui under ui/)
├── integrations/supabase/        # Browser, server, and auth-middleware clients
└── styles.css                    # Tailwind v4 + design tokens

supabase-migrations/              # Numbered SQL migrations (run in order)
```

---

## Database migrations

All schema lives under `supabase-migrations/` as numbered SQL files. Apply them in order via the Supabase SQL editor or `psql`. Latest migration: **`038_communications_surveys.sql`**.

See [REPRODUCTION.md §4](./REPRODUCTION.md#part-4--create-your-free-database-supabase) for the full bootstrap order.

---

## Server-side architecture rules

- **Internal server logic** → `createServerFn` in `src/lib/*.functions.ts`.
- **Public HTTP endpoints** (webhooks, cron, public APIs) → server routes under `src/routes/api/public/`.
- **RLS-bypassing admin client** (`@/integrations/supabase/client.server`) is only imported inside server function `.handler()` bodies via dynamic `await import(...)`.
- **Authenticated server fns** chain `.middleware([requireSupabaseAuth])`. The browser bearer token is auto-attached via `attachSupabaseAuth` registered in `src/start.ts`.

---

## Features by module

### Communications (`src/lib/campaigns.functions.ts`)
- TipTap editor → sanitized HTML → Resend API.
- Audience segments: all users, event attendees, approved vendors, dept members.
- Scheduling: `/api/public/dispatch-due` cron endpoint flushes due campaigns.
- Unsubscribe: `/api/public/unsubscribe?email=…` writes to `campaign_unsubscribes`.

### Surveys (`src/lib/surveys.functions.ts`)
- Question types: text, rating 1–5, multiple choice.
- Public route `/survey/$id` — anonymous, no auth required.
- Analytics: bar charts (Recharts v2) per question + free-text dump.

### Social Command (`src/lib/social.functions.ts`)
- Drag-and-drop calendar → Facebook, Instagram, LinkedIn.
- Per-department OAuth connections; tokens never leave the server.

### Permissions (`src/lib/staff-permissions.ts`)
- Page-level keys (`page.events`, `page.communications`, …).
- Per-event grants/revokes.
- Department roles override page-level grants automatically.

### Payments (`src/lib/payments.functions.ts`)
- USAePay wired in by default (`src/lib/usaepay.server.ts`).
- Pluggable via a `PAYMENT_PROVIDER` env switch — see REPRODUCTION.md for Stripe/PayPal/Square drop-ins.

---

## User documentation

The platform ships its own visual user manual at **`/manual`** (source: `src/routes/manual.tsx`). It covers every feature with screenshots, step-by-step instructions, and audience tags (community / staff / admin).

When you add a new module, add a section to `src/routes/manual.tsx` and register its ID in the `groups` array.

---

## License

See [LICENSE](./LICENSE). Free for cities, towns, nonprofits, and commercial use.

---

## Links

- **[REPRODUCTION.md](./REPRODUCTION.md)** — Soup-to-nuts setup guide (no coding required).
- **In-app manual** — `/manual` on any deployed instance.
- **TanStack Start docs** — https://tanstack.com/start
- **Supabase docs** — https://supabase.com/docs
- **Cloudflare Workers docs** — https://developers.cloudflare.com/workers
