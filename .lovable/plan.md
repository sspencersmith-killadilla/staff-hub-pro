# Communications & Surveys Module

A native replacement for Mailchimp + SurveyMonkey, integrated with departments, events, vendors, and the existing staff permissions system.

## Key decisions (locked in from your answers)

- **Email delivery:** Resend via the connector gateway, called from a TanStack server route at `/api/public/dispatch-campaign` (project's "edge function" equivalent — no Supabase Edge Function, per stack rules).
- **Editor:** TipTap rich-text editor for the email body and survey description.
- **Scheduling:** `scheduled_for` is supported; a pg_cron job pings the dispatch route every minute to fire due campaigns.
- **Surveys:** Always submitted anonymously (no `user_id` recorded even when logged in).
- **Permissions:** New keys `communications.manage` and `surveys.manage` gated through existing `usePermissions()` system.

## Part 1 — Database schema (migration `038_communications_surveys.sql`)

```text
communication_campaigns
  id uuid pk, department_id uuid fk departments null,
  subject text, body_html text, body_json jsonb,   -- TipTap JSON + rendered HTML
  status text check in (draft|scheduled|sending|sent|failed),
  target_audience_rules jsonb,
  scheduled_for timestamptz null,
  sent_at timestamptz null,
  created_by uuid fk auth.users,
  recipient_count int default 0,
  created_at, updated_at

campaign_recipients                    -- per-recipient audit
  id, campaign_id fk, email text,
  status (queued|sent|failed|suppressed), error text null,
  sent_at timestamptz, resend_id text null

campaign_unsubscribes                  -- email-level opt-out
  email text pk, unsubscribed_at timestamptz default now()

surveys
  id, department_id fk null, title, description_html text,
  is_active bool default true,
  redirect_to text default '/hub',
  created_by, created_at, updated_at

survey_questions
  id, survey_id fk, position int,
  question_text text,
  question_type text check in (text|rating_1_to_5|multiple_choice),
  options jsonb null,
  required bool default false

survey_responses
  id, survey_id fk,
  answers jsonb,                       -- { question_id: value } — always anonymous
  submitted_at timestamptz default now()
```

**target_audience_rules JSONB:**
```json
{ "segments": [
  { "type": "all_active_users" },
  { "type": "event_attendees", "event_id": "..." },
  { "type": "approved_vendors" },
  { "type": "department_members", "department_id": "..." }
] }
```
Segments unioned, deduped by email, filtered against `campaign_unsubscribes`.

**RLS + GRANTs (per public-schema-grants rule):**
- All tables RLS-enabled with explicit grants in same migration.
- Campaigns / recipients / surveys / questions: staff with the relevant permission scoped to manageable departments; admins full access.
- `surveys` + `survey_questions`: `SELECT` to `anon` + `authenticated` when survey `is_active`.
- `survey_responses`: `INSERT` open to `anon` + `authenticated`; `SELECT` restricted to staff with `surveys.manage`.
- `campaign_unsubscribes`: `INSERT`/`SELECT` open (public unsubscribe link must work without auth).

## Part 2 — Resend dispatch engine

**Connector setup:** Link the Resend connector via `standard_connectors--connect` (you'll get prompted). Gateway URL `https://connector-gateway.lovable.dev/resend`, auth via `LOVABLE_API_KEY` + `RESEND_API_KEY`.

**Server route `src/routes/api/public/dispatch-campaign.ts`** (POST):
- Verifies an `x-dispatch-secret` header against `DISPATCH_SECRET` env (so only pg_cron and authenticated staff fns can call it).
- Body: `{ campaign_id }`.
- Loads campaign, sets `status='sending'`.
- Resolves audience via `src/lib/communications.server.ts` → queries `attendees`, `vendor_applications`, `department_members`, `profiles` based on segments.
- Subtracts `campaign_unsubscribes`.
- For each recipient: inserts `campaign_recipients` row, POSTs to `https://connector-gateway.lovable.dev/resend/emails` with subject, `body_html` + unsubscribe footer (`<a href="{site}/unsubscribe?token=...">Unsubscribe</a>`), stores returned `resend_id`. Batched 10 at a time with small delay to respect rate limits.
- Updates campaign `status='sent'`, `sent_at`, `recipient_count`.

**Server fns in `src/lib/communications.functions.ts`:**
- `dispatchCampaign({ campaignId })` — staff-only; calls the public route internally with the shared secret.
- `sendTestCampaign({ campaignId })` — sends one email to the logged-in user via the same Resend path.
- `previewAudience({ rules })` — returns `{ count, sample: email[5] }`.
- `saveCampaign`, `listCampaigns`, `getCampaign`, `deleteCampaign`.

**Scheduler:** pg_cron job runs every minute, selects campaigns where `status='scheduled' AND scheduled_for <= now()`, calls the dispatch route via `pg_net` with the shared secret. SQL added to the migration.

**Unsubscribe route:** `src/routes/api/public/unsubscribe.ts` GET — validates token (HMAC of email), inserts into `campaign_unsubscribes`, returns simple confirmation HTML.

## Part 3 — Staff Communications dashboard

- Add `communications.manage` to `PermissionKey` in `src/lib/staff-permissions.ts`.
- Sidebar entry **Communications** (gated).
- Route `src/routes/_authenticated/staff/communications.tsx`: DataTable of campaigns (subject, status, audience count, scheduled_for, sent_at, actions).
- Route `src/routes/_authenticated/staff/communications.$id.tsx`: Campaign editor
  - Subject input
  - **TipTap editor** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`) with toolbar: bold, italic, headings, lists, links, blockquote. New component `src/components/RichTextEditor.tsx` (reusable).
  - **Audience Selector** component: chip list; "Add segment" popover with type + conditional secondary control (event picker, department picker). Live "Will send to N recipients" via `previewAudience`.
  - **Schedule control**: "Send now" vs "Schedule for" with date+time picker.
  - Buttons: **Save Draft**, **Send Test to Me**, **Schedule / Dispatch** (confirm dialog with recipient count).
- Recipients view (drawer): list of `campaign_recipients` with status.

## Part 4 — Survey builder (staff)

- Add `surveys.manage` to `PermissionKey`.
- Sidebar entry **Surveys & Feedback** (gated).
- Route `src/routes/_authenticated/staff/surveys.tsx`: list / create surveys.
- Route `src/routes/_authenticated/staff/surveys.$id.tsx`: editor
  - Title, **TipTap** description, active toggle, redirect URL.
  - Question list with drag-reorder (reuse `SortableList`), add/delete, per-question type selector and options input for `multiple_choice`, required toggle.
  - Public link with copy button.
- Route `src/routes/_authenticated/staff/surveys.$id.analytics.tsx`:
  - Per question: text → list of responses; rating → average + recharts BarChart of 1–5 distribution; multiple_choice → recharts PieChart of tallies.
  - Response count + completion-over-time LineChart.

Server fns in `src/lib/surveys.functions.ts`: `listSurveys`, `getSurvey`, `saveSurvey`, `saveQuestions`, `getSurveyAnalytics`, `deleteSurvey`.

## Part 5 — Public survey view

- Route `src/routes/survey.$id.tsx` (top-level, public, SSR on, no auth gate).
  - Loader → public server fn `getPublicSurvey({ id })` (admin client, only `is_active`, safe columns).
  - Mobile-friendly form: text input, 5-star rating control, radio group for multiple choice; required-field validation with Zod.
  - Submit → public server fn `submitSurveyResponse({ surveyId, answers })` — **always anonymous**, no `user_id` written even when logged in.
  - Completion state: "Thanks!" → `navigate({ to: survey.redirect_to ?? '/hub' })` after 2s.
- `head()` populates title/description/og from survey.

## Permissions wiring

- Permission keys added to `PermissionKey` union + admin Permissions UI.
- Sidebar + routes gated via `usePermissions().can(...)`.
- Server fns re-check permissions via `requireSupabaseAuth` + DB lookup.

## Dependencies & secrets

- New npm deps: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`.
- Resend connector linked → injects `RESEND_API_KEY` automatically.
- New secret `DISPATCH_SECRET` (random string) — I'll request via `add_secret`.
- `marked` not needed (TipTap outputs HTML directly via `generateHTML`).

## Build order

1. Link Resend connector + add `DISPATCH_SECRET`.
2. Migration 038 (schema + RLS + grants + pg_cron job).
3. `RichTextEditor` component + audience-resolver server helper.
4. Dispatch route + unsubscribe route + communications server fns.
5. Staff Communications dashboard + campaign editor.
6. Surveys schema fns + staff survey builder + analytics.
7. Public `/survey/:id` page.
8. Permission keys + sidebar entries + admin Permissions UI update.

Ready for your sign-off — once approved, switch me to build mode.
