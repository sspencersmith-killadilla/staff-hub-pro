# Reproduction Instructions

How to bring this platform up from a blank Lovable Cloud project.

## 1. Prerequisites

- Lovable workspace with **Lovable Cloud** enabled (auto-provisions Supabase + storage + auth).
- (Optional but recommended) **Resend** account for the Communications module — you only need the API key.
- (Optional) **Stripe** for ticketing.
- (Optional) **Meta** + **LinkedIn** developer apps for the Social Command Center.

## 2. Clone the project structure

The project uses the standard Lovable TanStack Start template. After cloning into a fresh project:

```bash
bun install
```

## 3. Apply database migrations in order

All schema lives in `supabase-migrations/`. Open Supabase → SQL Editor and run each file **in numeric order**:

```text
001_*  →  002_*  →  …  →  038_communications_surveys.sql
```

Latest schema as of writing: **`038_communications_surveys.sql`** (campaigns, surveys, survey questions/responses, RLS, grants).

> The migration files are idempotent (`create table if not exists`, etc.) and safe to re-run if anything is partially applied.

## 4. Configure secrets

In **Project Settings → Secrets**, add what you need:

| Secret | Required for | Notes |
| --- | --- | --- |
| `LOVABLE_API_KEY` | Everything | Auto-provisioned |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only writes | Auto-provisioned |
| `RESEND_API_KEY` | Communications module | From resend.com |
| `RESEND_FROM` | Communications (optional) | e.g. `City Events <hello@yourdomain.com>` — defaults to `onboarding@resend.dev` for testing |
| `SITE_URL` | Unsubscribe links (optional) | Defaults to deployed URL |
| `DISPATCH_SECRET` | Scheduled-campaign cron (optional) | Shared secret for `/api/public/dispatch-due` |
| `STRIPE_SECRET_KEY` | Ticketing | From stripe.com |
| `STRIPE_WEBHOOK_SECRET` | Ticketing webhooks | From the Stripe webhook setup |

Build secrets (Workspace Settings → Build Secrets) are only needed for private npm packages — not used by this project.

## 5. Create the first admin user

1. Visit `/signup` and create an account.
2. In Supabase SQL editor, promote yourself to admin:

```sql
insert into public.user_roles (user_id, role)
values ('<your-auth-user-id>', 'admin');
```

3. Reload the app. You should now see the **Event Ops** sidebar at `/staff`.

## 6. Bootstrap a department

1. Go to `/staff/admin/departments` → create a department.
2. Go to `/staff/admin/permissions` → assign yourself a department role (`super_admin` or `dept_admin`). Department admins automatically receive every page-level permission, scoped by RLS to their department.
3. Configure the department's enabled modules at `/staff/admin/tenants` (modules table).
4. Set branding at `/staff/admin/branding`.

## 7. Configure optional modules

### Communications
1. Add `RESEND_API_KEY` to Project Settings.
2. (Optional) Add `RESEND_FROM` with a verified sender. Without it, emails go from `onboarding@resend.dev` (Resend test sender, max 100/day).
3. Grant `page.communications` to staff under **Admin → Permissions**.
4. (Optional, for scheduled sends) Set up a per-minute pg_cron job in Supabase:

   ```sql
   select cron.schedule(
     'dispatch-due-campaigns',
     '* * * * *',
     $$select net.http_post(
       url := 'https://YOUR-DOMAIN/api/public/dispatch-due',
       headers := '{"x-dispatch-secret":"YOUR_SECRET"}'::jsonb
     )$$
   );
   ```

### Surveys
- No setup needed beyond migration 038 and the `page.surveys` permission.

### Social Command Center
1. Create Meta + LinkedIn developer apps (see in-app guide at `/manual#admin-social`).
2. Paste OAuth credentials at `/staff/admin/social-integrations`.
3. Grant `page.social_command` to staff.

### Ticketing & Payments
1. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
2. Configure webhook → `https://YOUR-DOMAIN/api/public/stripe-webhook`.

## 8. Smoke test

After setup, verify each surface loads:

- `/` — home page (CMS-driven, may need content seeded via `/staff/admin/home`)
- `/events` — public event listing
- `/manual` — full visual user manual
- `/staff` — staff dashboard
- `/staff/admin/permissions` — admin panel
- `/staff/communications` — campaigns list (requires `page.communications`)
- `/staff/surveys` — surveys list (requires `page.surveys`)
- `/survey/<some-active-survey-id>` — public anonymous form

## 9. Publishing

Click **Publish** in Lovable to push to `https://your-project.lovable.app`. The server routes (incl. `/api/public/*`) deploy with the app — no separate edge-function deploy step.

---

## Troubleshooting

**"Failed to resolve import" on a route file** — make sure the file exists *before* the import statement runs. Run `bun install` and restart the dev server.

**`new row violates row-level security policy`** — check that the user is signed in and that the migration's `GRANT` statements ran (every public-schema table needs explicit grants in addition to RLS policies).

**Campaign stays in `scheduled` status forever** — cron job isn't pinging `/api/public/dispatch-due`. Either set up pg_cron (step 7 above) or trigger manually with curl.

**Email comes from `onboarding@resend.dev`** — that's the Resend test sender. Set `RESEND_FROM` to your verified domain.

**Survey link returns "Survey not available"** — the survey is toggled `Inactive`. Open it in `/staff/surveys/$id` and flip the Active switch.
