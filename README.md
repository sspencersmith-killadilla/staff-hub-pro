# Total Event System Solutions

An open-source, multi-tenant, multi-department community event & partnership platform. Built for **small cities, towns, and nonprofits** that want a complete event-management system without the per-seat SaaS bill.

Built on **TanStack Start** (React 19 + Vite 7), **Supabase** (Postgres + Auth + Storage + RLS), and **Cloudflare Workers** for SSR. Runs $0/month at small-city scale.

> **New to the project?** See [REPRODUCTION.md](./REPRODUCTION.md) — a soup-to-nuts, no-coding-required setup guide.

---

## What's in the platform

### For community members
- **Events & ticketing** — browse sessions, buy tickets (multiple payment providers supported), receive QR codes.
- **Room reservations** — request meeting rooms, track approval state.
- **StreetBeats** — register as a busker, claim and share gig flyers.
- **Community organizations & events** — orgs can publish their own events.
- **Vendor & sponsor applications** — apply per-event with documents and payment.
- **Special-event permits** — submit and track city permit applications.
- **Personal Hub** — single page showing your tickets, applications, reservations, and favorites.

### For staff
- **Per-department workspace** — sidebar scoped to your active department.
- **Event ops** — sessions, stages, attendees, door scanner, reports, marketing.
- **Approvals** — vendor/sponsor/room/permit queues.
- **Cross-department visibility** — for super admins.

### For admins
- **Granular permissions** — page-level + per-event grants/revokes.
- **Multi-department tenancy** — each department gets its own theme, modules, and roles.
- **Platform modules** — turn features on/off per department.
- **Branding engine** — colors, fonts, logos per tenant.
- **Home page CMS** — editable hero, sections, tenant overrides.
- **Guidebook publisher** — public-facing program PDFs.
- **Social Command Center** — schedule posts to Facebook, Instagram, and LinkedIn from one calendar.
- **Communications** — native email campaigns (Resend), audience segments, scheduling, unsubscribe handling.
- **Surveys & Feedback** — native survey builder with anonymous responses and Recharts analytics.

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
