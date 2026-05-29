
## Goal

Replace the mocked social publishing with real per-org OAuth connections to Meta (Facebook Page + Instagram Business) and LinkedIn (Company Page), gated by a new `page.social_command` staff permission, and document everything in the in-app manual.

## What gets built

### 1. New staff permission

Add to `src/lib/staff-permissions.ts`:
- `page.social_command` — "Social Command Center"

Backfill grant to existing staff/admin in a new migration so nothing breaks for current users. Wire it into the `_authenticated/staff/admin/social` route and the sidebar link (`event-ops-sidebar.tsx`) so it only shows when granted.

### 2. Database (one migration: `028_social_connections.sql`)

```text
social_connections
  id uuid pk
  department_id uuid fk -> departments (per-org scoping)
  platform text check in ('facebook','instagram','linkedin')
  account_id text         -- FB page id / IG business id / LinkedIn org URN
  account_name text       -- display label
  access_token text       -- encrypted at rest via pgsodium (or stored as-is + RLS-locked)
  refresh_token text null
  token_expires_at timestamptz null
  scopes text[]
  connected_by uuid fk -> auth.users
  connected_at timestamptz default now()
  unique (department_id, platform, account_id)

social_posts
  id uuid pk
  department_id uuid fk
  scheduled_for timestamptz
  caption text
  media_url text null
  event_id uuid null fk -> sessions
  platforms text[]        -- ['facebook','instagram','linkedin']
  status text             -- 'scheduled' | 'publishing' | 'published' | 'failed'
  results jsonb           -- per-platform { platform, post_id?, error? }
  created_by uuid fk -> auth.users
  created_at timestamptz
```

RLS: only staff with `page.social_command` (or admin) in the same department can read/write. Service role bypass for the publish worker. Standard `GRANT`s.

### 3. OAuth flows (server routes)

Three public OAuth callback routes + matching "start" server functions. All use stable `project--{id}.lovable.app` URLs as the redirect URI.

```text
src/routes/api/public/oauth/meta/callback.ts       -- handles FB + IG (shared)
src/routes/api/public/oauth/linkedin/callback.ts
```

Plus server functions in `src/lib/social-connections.functions.ts`:
- `startMetaOAuth({ departmentId })` → returns authorize URL with `state` (signed JWT of department+user)
- `startLinkedInOAuth({ departmentId })` → same
- `listConnections({ departmentId })`
- `disconnect({ connectionId })`
- `publishPost({ postId })` — server-side fan-out to each platform

### 4. Secrets the user must add

Six secrets via `secrets--add_secret`:
- `META_APP_ID`, `META_APP_SECRET`
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- `OAUTH_STATE_SECRET` (HMAC signing key)
- *(X dropped from real publishing for now — UI keeps it as "manual copy" since X API v2 posting requires a paid tier; flagged in manual.)*

### 5. UI changes

- **`/staff/admin/social/connections`** (new route): list connected accounts per department, "Connect Facebook Page", "Connect Instagram", "Connect LinkedIn" buttons that open the OAuth popup. Disconnect button per account.
- **`/staff/admin/social`** (existing): replace mocked `savePost` with real `publishPost` call. Show only platforms the current department has connected. Persist posts to `social_posts`. Add a "Manage connections" link in header.
- Sidebar: add `Social Command` under a `page.social_command` guard (already there, just gate it).

### 6. Manual update (`src/routes/manual.tsx`)

Add a new section "Social Media Command Center" covering:
- What it does (calendar, drag-to-schedule, composer, live preview)
- How to grant access (new `page.social_command` permission)
- How to connect Facebook / Instagram / LinkedIn (step-by-step, including what to set up in Meta Developer Console and LinkedIn Developer Portal: app creation, required scopes, redirect URI to paste)
- X note (manual copy/paste workflow, paid API tier required for automation)
- Per-department scoping (each department connects its own accounts)
- Image focal-point picker on guidebook cards (recent change)
- Guidebook sponsorship tier on vendor portal (recent change)

## Technical details

- **Meta scopes**: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `business_management`. IG publish requires the Page→IG Business linkage.
- **LinkedIn scopes**: `w_organization_social`, `r_organization_social`, `rw_organization_admin`.
- **Token storage**: tokens go in `social_connections.access_token` as text. RLS locks the column to admin/service-role reads; client code never selects it (only server fns do). Long-lived FB tokens (~60 days) refreshed lazily on publish.
- **Publish worker**: synchronous on "Schedule" click for now (no cron). A follow-up can add pg_cron hitting `/api/public/social/publish-due`.
- **State param**: HMAC(department_id|user_id|nonce|expiry) signed with `OAUTH_STATE_SECRET` to prevent CSRF.

## Out of scope (call out in chat after)

- X/Twitter automated publishing (paid API)
- TikTok, YouTube, Threads
- Auto token refresh background job
- Post analytics fetch-back
- Approval workflow before publish

## Order of operations

1. Migration + permission + sidebar gate (smallest, unblocks UI work)
2. Secret prompts via `secrets--add_secret`
3. `social-connections.functions.ts` + OAuth callback routes
4. `/staff/admin/social/connections` page
5. Wire real publish into existing `/staff/admin/social`
6. Manual rewrite
