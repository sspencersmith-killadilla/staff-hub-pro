# Total Event System Solutions

A multi-tenant, multi-department community event & partnership platform. Built on **TanStack Start** (React 19 + Vite 7), **Supabase** (Postgres + Auth + Storage + RLS), and **Cloudflare Workers** for SSR.

> **Live preview:** https://id-preview--44bd1e98-47d5-489a-8e35-066a9a498b60.lovable.app
> **Production:** https://totaleventsystemsolutions.lovable.app

---

## What's in the platform

### For community members
- **Events & ticketing** — browse sessions, buy tickets (Stripe), receive QR codes.
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
- **Surveys & Feedback** — native survey builder with anonymous responses and recharts analytics.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start v1 (React 19, Vite 7) |
| Runtime | Cloudflare Workers (SSR via `nodejs_compat`) |
| Database | Supabase Postgres with RLS |
| Auth | Supabase Auth (email/password + Google OAuth via Lovable broker) |
| Styling | Tailwind v4 (`src/styles.css`) + shadcn/ui |
| State | TanStack Query |
| Rich text | TipTap |
| Charts | Recharts v2 |
| Email | Resend |
| Payments | Stripe |
| Image gen | Lovable AI Gateway (auto image storage) |

---

## Repo layout

```
src/
├── routes/                       # File-based routes (TanStack Router)
│   ├── __root.tsx                # Root layout / shellComponent
│   ├── index.tsx                 # Home (CMS-driven)
│   ├── _authenticated/           # Auth-gated subtree (managed; do not edit)
│   │   └── staff/                # Staff dashboards
│   ├── api/public/               # Webhooks & cron (no published-site auth)
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

## Local development

```bash
bun install
bun dev               # starts Vite on http://localhost:8080
```

Environment variables come from Lovable Cloud (auto-injected). Locally you'll need:

| Variable | Where |
| --- | --- |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | Supabase project |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only |
| `LOVABLE_API_KEY` | Auto-provisioned |
| `RESEND_API_KEY` | If using Communications module |
| `RESEND_FROM` *(optional)* | Verified sender email |
| `STRIPE_SECRET_KEY` | If using ticketing |

---

## Database migrations

All schema lives under `supabase-migrations/` as numbered SQL files. Apply them in order via the Supabase SQL editor or `psql`. Latest migration: **`038_communications_surveys.sql`**.

See [REPRODUCTION.md](./REPRODUCTION.md) for the full bootstrap order.

---

## Server-side architecture rules

- **Internal server logic** → `createServerFn` in `src/lib/*.functions.ts`.
- **Public HTTP endpoints** (webhooks, cron, public APIs) → server routes under `src/routes/api/public/`.
- **Never** use Supabase Edge Functions for app logic — they're only for externally called webhooks that must live inside Supabase's network.
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

---

## User documentation

The platform ships its own visual user manual at **`/manual`** (source: `src/routes/manual.tsx`). It covers every feature with screenshots, step-by-step instructions, and audience tags (community / staff / admin).

When you add a new module, add a section to `src/routes/manual.tsx` and register its ID in the `groups` array.

---

## Links

- [REPRODUCTION.md](./REPRODUCTION.md) — How to spin this project up from scratch.
- [.lovable/plan.md](./.lovable/plan.md) — Current build plan (Communications & Surveys).
- In-app manual: `/manual`
