# Communications & Surveys Module (Resend)

Native replacement for Mailchimp + SurveyMonkey using your own Resend API key.

## Locked-in decisions

- **Email delivery:** Resend, called directly with your `RESEND_API_KEY` from a server route at `/api/public/dispatch-campaign`.
- **Editor:** TipTap rich-text editor.
- **Scheduling:** `scheduled_for` supported; pg_cron pings the dispatch route every minute.
- **Surveys:** Always anonymous submissions.
- **Permissions:** `communications.manage` + `surveys.manage` gated through existing `usePermissions()`.

## Setup (one-time)

I'll request via `add_secret`:
- `RESEND_API_KEY` — your Resend API key.
- `RESEND_FROM` — verified sender like `Events <hello@yourdomain.com>`.
- `DISPATCH_SECRET` — random string protecting the dispatch route.
- `SITE_URL` — base URL for unsubscribe links (auto-defaults to publish URL if omitted).

## Part 1 — Schema (migration `038_communications_surveys.sql`)

```text
communication_campaigns
  id uuid pk, department_id uuid fk null,
  subject text, body_html text, body_json jsonb,   -- TipTap JSON + rendered HTML
  status text check in (draft|scheduled|sending|sent|failed),
  target_audience_rules jsonb,
  scheduled_for timestamptz null, sent_at timestamptz null,
  created_by uuid, recipient_count int default 0,
  created_at, updated_at

campaign_recipients
  id, campaign_id fk, email text,
  status (queued|sent|failed|suppressed), error text null,
  sent_at timestamptz, resend_id text null

campaign_unsubscribes               -- email pk, unsubscribed_at

surveys                             -- title, description_html, is_active, redirect_to, dept
survey_questions                    -- position, text, type (text|rating_1_to_5|multiple_choice), options jsonb, required
survey_responses                    -- answers jsonb, submitted_at  (NO user_id — always anonymous)
```

**target_audience_rules**:
```json
{ "segments": [
  { "type": "all_active_users" },
  { "type": "event_attendees", "event_id": "..." },
  { "type": "approved_vendors" },
  { "type": "department_members", "department_id": "..." }
] }
```
Unioned, deduped, filtered against `campaign_unsubscribes`.

**RLS + GRANTs** (per public-schema-grants rule, in same migration):
- Campaigns / recipients / surveys / questions: staff with permission scoped to manageable departments; admins full.
- `surveys` + `survey_questions`: `SELECT` to `anon`+`authenticated` when active.
- `survey_responses`: `INSERT` open to `anon`+`authenticated`; `SELECT` staff with `surveys.manage`.
- `campaign_unsubscribes`: `INSERT`/`SELECT` open (public link must work).

## Part 2 — Resend dispatch

**Server route `src/routes/api/public/dispatch-campaign.ts`** (POST):
- Verifies `x-dispatch-secret` header against `DISPATCH_SECRET`.
- Body: `{ campaign_id }`.
- Loads campaign → `status='sending'`.
- Resolves audience via `src/lib/communications.server.ts` (admin client, queries `attendees`, `vendor_applications`, `department_members`, `profiles`).
- Subtracts `campaign_unsubscribes`.
- For each recipient (batched 10, small delay): inserts `campaign_recipients` row, POSTs `https://api.resend.com/emails` with `from`=`RESEND_FROM`, body_html + unsubscribe footer (`{SITE_URL}/api/public/unsubscribe?token=<HMAC of email>`), stores returned id.
- Updates `status='sent'`, `sent_at`, `recipient_count`.

**Staff server fns** `src/lib/communications.functions.ts`:
- `dispatchCampaign({ campaignId })` — staff; calls the public route internally with the shared secret.
- `sendTestCampaign({ campaignId })` — sends one email to the logged-in user via Resend directly.
- `previewAudience({ rules })` — `{ count, sample: email[5] }`.
- `saveCampaign`, `listCampaigns`, `getCampaign`, `deleteCampaign`.

**Scheduler:** pg_cron job runs every minute, selects campaigns with `status='scheduled' AND scheduled_for <= now()`, calls `/api/public/dispatch-campaign` via `pg_net` with the shared secret. SQL in the migration.

**Unsubscribe route** `src/routes/api/public/unsubscribe.ts` GET — validates HMAC token, upserts `campaign_unsubscribes`, returns simple confirmation HTML.

## Part 3 — Staff Communications dashboard

- Add `communications.manage` to `PermissionKey`.
- Sidebar entry **Communications** (gated).
- `src/routes/_authenticated/staff/communications.tsx`: DataTable (subject, status, audience count, scheduled_for, sent_at, actions).
- `src/routes/_authenticated/staff/communications.$id.tsx`: editor
  - Subject input.
  - **TipTap editor** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`) → `src/components/RichTextEditor.tsx` (reusable).
  - **Audience Selector**: chip list with "Add segment" popover (event picker, dept picker), live "Will send to N recipients" via `previewAudience`.
  - **Schedule control**: "Send now" vs "Schedule for" date+time.
  - Buttons: Save Draft, Send Test to Me, Schedule / Dispatch (confirm dialog with count).
- Recipients drawer: list of `campaign_recipients` with status.

## Part 4 — Survey builder (staff)

- Add `surveys.manage` to `PermissionKey`.
- Sidebar entry **Surveys & Feedback** (gated).
- `surveys.tsx` (list/create), `surveys.$id.tsx` (editor), `surveys.$id.analytics.tsx`.
- Editor: title, TipTap description, active toggle, redirect URL, drag-reorder questions (reuse `SortableList`), per-question type + options + required, copy public link button.
- Analytics: per-question — text→list; rating→recharts BarChart of 1–5 + average; multiple_choice→PieChart of tallies. Response count + over-time LineChart.

## Part 5 — Public `/survey/:id`

- `src/routes/survey.$id.tsx` (top-level, public, SSR on, no auth gate).
- Public fn `getPublicSurvey({ id })` (admin client, only `is_active`, safe columns).
- Mobile-friendly form: text / 5-star / radio. Zod-validated required fields.
- Submit → public fn `submitSurveyResponse({ surveyId, answers })` — always anonymous, no user_id.
- Completion → redirect to `survey.redirect_to ?? '/hub'` after 2s.
- `head()` from survey for shareable links.

## Permissions wiring

- New keys added to `PermissionKey` union + admin Permissions UI.
- Sidebar + routes gated via `usePermissions().can(...)`.
- Server fns re-check via `requireSupabaseAuth` + DB lookup.

## Dependencies

- New npm: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `isomorphic-dompurify` (sanitise HTML server-side before storage).
- Secrets to add: `RESEND_API_KEY`, `RESEND_FROM`, `DISPATCH_SECRET`, optional `SITE_URL`.

## Build order

1. Request secrets via `add_secret`.
2. Migration 038 (schema + RLS + grants + pg_cron job).
3. `RichTextEditor` component + audience-resolver server helper.
4. Dispatch route + unsubscribe route + communications server fns.
5. Staff Communications dashboard + campaign editor + permission key.
6. Surveys server fns + staff survey builder + analytics + permission key.
7. Public `/survey/:id` page.
8. Sidebar entries + admin Permissions UI.

Approve to switch to build mode and ship.
