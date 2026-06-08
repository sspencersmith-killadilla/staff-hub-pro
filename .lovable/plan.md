## Civic Quests v2 — Visuals, Tickets, Raffles

Four enhancement tracks layered on the existing `quests` / `quest_waypoints` / completion tables. Builds on department-tagging work already in place.

### 1. Waypoint visual polish (no schema)

In `src/routes/explore.$questId.tsx` and `explore.index.tsx`:

- Per-completion-type chip + icon + accent color:
  - `qr_scan` → amber, QrCode icon, "Scan QR at location"
  - `geo_location` → emerald, MapPin icon, "Check in nearby" + meters radius badge
  - `honor_system_button` → indigo, Hand icon, "Tap when you've done it"
- Larger map (when any waypoint has lat/lng) with numbered pins matching list order; clicking a pin scrolls to the waypoint card.
- Progress: animated progress bar at top, stamped "✓" overlay on completed cards, confetti burst on final completion (framer-motion + canvas-confetti, already available).
- Completion-celebration screen showing badge + earned prize ticket (see #3).

### 2. Waypoint images

Schema (`supabase-migrations/050_quest_waypoint_media.sql`):

```sql
alter table public.quest_waypoints
  add column if not exists image_url text,
  add column if not exists image_alt text;
```

- New public bucket `quest-media` (public read; admin-only write via RLS on `storage.objects`).
- Admin (`admin.quests.tsx`): per-waypoint image picker with two paths — **Upload** (file → bucket) or **Generate** (calls AI Gateway `openai/gpt-image-2` via existing image-gen route, prompt = waypoint title + description). Preview + replace.
- Citizen view: hero image at top of each waypoint card; map info-window thumbnail uses the same URL.

### 3. Virtual prize tickets (mixed catalog + QR redemption)

Schema (`051_quest_prizes.sql`):

```sql
create table public.prizes (
  id uuid pk, name text, description text, image_url text,
  fulfilled_by text check (in ('city','sponsor')),
  sponsor_business_id uuid references businesses(id),
  pickup_location text,            -- "City Hall, Room 102" or business address
  total_quantity int,              -- null = unlimited
  remaining_quantity int,
  is_active bool,
  created_at, updated_at
);

create table public.quest_prize_rewards (   -- which prize a quest awards
  quest_id uuid references quests(id) on delete cascade,
  prize_id uuid references prizes(id) on delete cascade,
  primary key (quest_id, prize_id)
);

create table public.prize_tickets (         -- minted on quest completion
  id uuid pk,
  user_id uuid references auth.users(id),
  quest_id uuid references quests(id),
  prize_id uuid references prizes(id),
  serial text unique,                       -- short human code, e.g. TKT-7F3A9C
  qr_token text unique,                     -- long random, embedded in QR
  status text check (in ('issued','redeemed','void')) default 'issued',
  issued_at timestamptz default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id)
);
```

Standard grants + RLS:
- `prizes`: public select where `is_active`; admin write. Sponsors (business owners) may insert their own where `fulfilled_by='sponsor'` and `sponsor_business_id` matches one of their businesses; admin approval flag gates `is_active`.
- `prize_tickets`: owner can select their own; staff/admin select all; admin write; insert via `mint_prize_ticket` SECURITY DEFINER on quest completion only.

Server functions (`src/lib/quest-prizes.functions.ts`):
- `mintPrizeTicket(questId)` — called from existing completion path when last waypoint completes; picks an active reward, decrements `remaining_quantity`, generates serial + qr_token. Idempotent per (user, quest).
- `getMyTickets()` — citizen wallet.
- `redeemTicket(qrToken)` — staff/admin only; marks redeemed.

Admin UI (`admin.prizes.tsx`, new):
- Prize catalog CRUD with image upload, quantity, pickup location, sponsor toggle.
- Per-quest "Reward" picker on existing `admin.quests.tsx`.
- Sponsor approval inbox.

Citizen UI:
- `/wallet` route → list of issued tickets, each card flips to a full-screen QR code with serial underneath ("Show this at City Hall — Room 102").
- Quest completion screen offers "View ticket" CTA.

Staff redemption (`/staff/redeem`, new):
- Camera-based QR scanner (`html5-qrcode`) + manual serial entry fallback.
- Shows ticket detail (citizen name, prize, pickup location) and "Mark redeemed" button.

### 4. Raffle entries

Schema (`052_quest_raffles.sql`):

```sql
create table public.raffles (
  id uuid pk, title text, description text, image_url text,
  draw_date timestamptz, status text check (in ('open','drawn','closed')),
  prize_id uuid references prizes(id),
  winners_count int default 1
);
create table public.raffle_quests (         -- which quests grant entries
  raffle_id uuid references raffles(id) on delete cascade,
  quest_id  uuid references quests(id)  on delete cascade,
  entries_per_completion int default 1,
  primary key (raffle_id, quest_id)
);
create table public.raffle_entries (
  id uuid pk, raffle_id uuid, user_id uuid, quest_id uuid,
  earned_at timestamptz default now()
);
create table public.raffle_winners (
  raffle_id uuid, user_id uuid, drawn_at timestamptz, notified bool
);
```

- On quest completion, if the quest is linked to one or more open raffles, insert N entries per linked raffle.
- Admin `admin.raffles.tsx`: create raffle, link quests, set draw date / entry count; "Draw winners" button (server fn picks N distinct random user_ids).
- Citizen view in `/wallet`: "Your raffle entries" panel showing entries per open raffle and draw date countdown. Winners get a banner + their ticket auto-minted from the linked prize.

### Home page integration

Promote on `/` (uses existing portal grid editor): add tile linking to `/wallet` when user has any active ticket or raffle entry. No layout rebuild.

### Out of scope

- Sponsor self-service onboarding (uses existing business owner role).
- Email/SMS notifications for winners (in-app banner only; can be added later).
- Mobile-app push.

### Technical notes (for the implementer)

- All migrations include `GRANT` blocks per public-schema rules.
- Ticket minting uses a SECURITY DEFINER function so RLS doesn't need an insert policy for citizens.
- QR images rendered client-side with `qrcode.react` (small dep, no server call).
- Scanner uses `html5-qrcode` (works on mobile Safari + Android Chrome).
- Image generation reuses the existing `/api/generate-image` SSE route (or adds it if missing — pattern in `ai-image-generation-tanstack`).
- Storage bucket `quest-media` is public read; writes restricted via `storage.objects` RLS to admins.

### Files (approx.)

```text
supabase-migrations/
  050_quest_waypoint_media.sql
  051_quest_prizes.sql
  052_quest_raffles.sql
src/lib/
  quest-prizes.functions.ts
  raffles.functions.ts
src/routes/
  _authenticated/wallet.tsx                 (citizen ticket wallet)
  _authenticated/staff/redeem.tsx           (QR scanner)
  _authenticated/staff/admin.prizes.tsx
  _authenticated/staff/admin.raffles.tsx
src/components/quest/
  WaypointCard.tsx                          (typed chip + image)
  QuestMap.tsx                              (numbered pins)
  CompletionCelebration.tsx
  TicketQR.tsx
src/routes/explore.$questId.tsx             (rewrite to use new components)
src/routes/_authenticated/staff/admin.quests.tsx  (add image + reward pickers)
```
