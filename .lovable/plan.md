## Goal

Let an admin configure the email-sending provider for **Communications** from a web page in the Staff/Admin area — exactly the same way `Admin → Social Integrations` lets them paste OAuth credentials for Meta/LinkedIn — instead of having to set `RESEND_API_KEY` / `RESEND_FROM` / `SITE_URL` as platform secrets in the hosting environment.

## What exists today

- `src/lib/communications.server.ts` reads `process.env.RESEND_API_KEY`, `process.env.RESEND_FROM`, and `process.env.SITE_URL` at send time. No UI to set them.
- The Social Integrations pattern (`supabase-migrations/028_social_command.sql`, `src/lib/social.functions.ts`, `src/routes/_authenticated/staff/admin.social-integrations.tsx`) already does this cleanly: one row per platform in `social_integration_secrets`, list/save server fns, admin-only RLS, an admin page with a card per platform.

## Design (mirror the social-integrations pattern)

### 1. New table: `public.email_integration_settings`

Single-row-per-provider, admin-only, RLS-locked, never returned to the client with the secret value.

```sql
create table public.email_integration_settings (
  provider text primary key check (provider in ('resend')),
  api_key text,                 -- write-only from the API (never SELECTed back)
  from_address text,            -- e.g. "Our City <notify@ourcity.gov>"
  reply_to text,
  site_url text,                -- used in unsub footer link
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
-- grants + admin-only RLS (only has_role(auth.uid(),'admin') can read/write)
```

(Provider list starts at `resend`; the `check` is easy to widen later if we add SES/Postmark/Mailgun.)

### 2. Server functions in `src/lib/email-settings.functions.ts`

- `getEmailSettings()` — admin-only. Returns `{ provider, from_address, reply_to, site_url, is_active, has_api_key: boolean, updated_at }`. **Never returns `api_key`.**
- `saveEmailSettings({ provider, api_key?, from_address, reply_to?, site_url?, is_active })` — admin-only. Upserts. If `api_key` is omitted/empty, keeps the existing one.
- `sendProviderTest({ to })` — admin-only. Sends a test email **using the DB settings** (not env), so the admin can verify wiring from the page.

### 3. Rewrite `communications.server.ts` to read from the DB first

New helper `getEmailConfig()`:

1. Load the active row from `email_integration_settings` via `supabaseAdmin`.
2. If `is_active` and `api_key`/`from_address` present → use those.
3. Else fall back to `process.env.RESEND_API_KEY` / `RESEND_FROM` / `SITE_URL` (keeps current deployments working, and keeps tests passing with env-only setups).
4. If neither is configured → `resendSend` returns a clean error `"Email provider not configured. Open Admin → Email Settings."` (already surfaces via the existing toasts).

`sendTest` and `dispatchCampaign` keep their current shape; only the inner `resendSend` and `withFooter` switch to the resolved config.

### 4. New admin page: `src/routes/_authenticated/staff/admin.email-settings.tsx`

Same shape as `admin.social-integrations.tsx`:

- Header + short copy explaining what this controls.
- One card for **Resend** with fields:
  - From address (with helper text: "Use a verified domain, or leave blank to use the Resend sandbox `onboarding@resend.dev` for testing.")
  - Reply-to (optional)
  - Site URL (helper: "Used to build the unsubscribe link in every email — defaults to your published site.")
  - API key (password input, "Leave blank to keep current" when one is already saved)
  - Active toggle
- Save button.
- "Send test email to:" input + button calling `sendProviderTest`.
- Link out to https://resend.com/api-keys with brief 3-step instructions: create Resend account → verify your domain → paste API key here.

### 5. Sidebar / navigation

Add an "Email Settings" link in `event-ops-sidebar.tsx` under the existing Admin group (next to `Admin → Social Integrations`), admin-only.

### 6. Docs touch-up (lightweight, no PDF rebuild)

In `REPRODUCTION.md` the **Optional add-ons → Resend** section currently tells users to add `RESEND_API_KEY` as a Cloudflare Worker secret. Replace that with: "Sign in as admin → Admin → Email Settings → paste your Resend API key and from address." Keep the env-var path as the fallback ("advanced / headless deployments").

## Out of scope

- Adding SES / Postmark / Mailgun providers (the schema leaves room, but no UI/code for them yet).
- Rebuilding `public/ReproductionInstruction.pdf`.
- Any change to the surveys flow or campaigns UI other than what's needed for sendTest plumbing.
- Storing the API key encrypted at rest (Supabase already encrypts the column; we just never return it to the client). If you want pgcrypto/Vault on top, that's a follow-up.

## Files added / changed

- `supabase-migrations/040_email_integration_settings.sql` *(new)*
- `src/lib/email-settings.functions.ts` *(new)*
- `src/lib/communications.server.ts` *(edit — config resolver)*
- `src/routes/_authenticated/staff/admin.email-settings.tsx` *(new)*
- `src/components/event-ops-sidebar.tsx` *(edit — admin link)*
- `REPRODUCTION.md` *(edit — Resend section)*

## Verification

1. Apply migration → row absent → existing env-only sends still work.
2. Admin opens `/staff/admin/email-settings`, pastes a Resend test key + from address, toggles Active, clicks **Send test email to me** → email arrives.
3. Open Communications → create a campaign → Send test → uses the new DB-stored key (verify by leaving `RESEND_API_KEY` unset in env).
4. Non-admin staff visiting `/staff/admin/email-settings` see "Admin access required" (mirrors social-integrations behavior).
