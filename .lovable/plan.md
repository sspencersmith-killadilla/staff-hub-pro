
## Goal

Replace the per-organization WorkPlanOS integration with a **per-tenant** integration managed from the staff admin console. Both **admin** and **dept_admin** roles can configure it. The existing per-org page (`/org/$orgId/integrations`) is removed.

## What changes

### 1. Database (`supabase-migrations/058_wpo_tenant_scope.sql`)

Re-key the three WPO tables from `org_id` → `tenant_id` and rewrite RLS for staff roles:

- `workplanos_integration`:
  - Drop existing FK + unique on `org_id`, drop existing RLS policies.
  - Rename `org_id` → `tenant_id uuid references public.tenants(id) on delete cascade`, unique.
  - New policies (using existing `public.has_role`):
    - Read/write allowed when `has_role(auth.uid(),'admin')` OR `has_role(auth.uid(),'dept_admin')`.
    - service_role keeps full access.
- `event_external_refs`: unchanged (per-event mapping, not tenant-scoped).
- `integration_dispatches`: rename `org_id` → `tenant_id`, update policies the same way.
- Re-confirm GRANTs (`authenticated`, `service_role`).
- Drop any seed/test rows tied to old `org_id` since the feature is unreleased.

### 2. Server functions (`src/lib/workplanos.functions.ts`)

- Replace `assertOrgOwner(orgId, userId)` with `assertCanManageWpo(tenantId, userId)` that:
  - Verifies the tenant exists.
  - Checks user has `admin` or `dept_admin` role via `has_role` (RPC or direct table check using `supabaseAdmin`).
- Rename params `orgId` → `tenantId` on:
  - `getWpoIntegration`, `saveWpoIntegration`, `rotateWpoSecret`, `disableWpoIntegration`, `listWpoDispatches`.
- Replace `listMyOwnedOrgs` with `listManageableTenants`: returns `public.tenants` rows when caller is admin or dept_admin (admins see all; dept_admins also see all since the integration is tenant-wide config).
- Secret masking, hash storage, one-time plaintext return — unchanged.

### 3. Inbound webhook (`src/routes/api/public/integrations.wpo.inbound.ts`)

- Change required header from `x-wpo-workspace: <org_id>` to `x-wpo-tenant: <tenant_id>` (keep the old name as a fallback for one release if desired — default plan: hard switch since unreleased).
- Lookup `workplanos_integration` by `tenant_id`. HMAC verification logic unchanged.
- Logging writes `tenant_id` into `integration_dispatches`.

### 4. New staff page (`src/routes/_authenticated/staff/admin.integrations.tsx`)

- Route: `/staff/admin/integrations`.
- `beforeLoad`: require session + `admin` OR `dept_admin` role (mirror `admin.tsx` gate, but allow either).
- UI:
  - Tenant selector (auto-selects if only one tenant exists).
  - WorkPlanOS card identical to the old org page: base URL, workspace ID, Save, Generate/Rotate secret, Disable, one-time secret reveal, masked current secret.
  - Inbound webhook block showing:
    - URL: `<origin>/api/public/integrations/wpo/inbound`
    - Header `x-wpo-tenant: <tenant_id>`
    - Header `x-wpo-signature: sha256=<hmac_sha256(shared_secret, raw_body)>`
  - Recent dispatches table (last 50, polled).
- Add an "Integrations" tile to `AdminNavGrid` (in `admin.home.tsx` or wherever it lives) linking here.

### 5. Removals

- Delete `src/routes/_authenticated/org.$orgId.integrations.tsx`.
- Any internal links to that route (none expected — verify with a quick search).

## Non-goals

- No changes to `event_external_refs` shape or outbound dispatch flow.
- No new auth provider; uses existing `has_role` + `requireSupabaseAuth`.
- No UI for assigning specific tenants to specific dept_admins — both roles can configure any tenant. Can be tightened later if needed.

## Risk / migration notes

- Feature is freshly added in migration 057, so the column rename is safe. If any rows exist locally, they'll be dropped — call out in chat after applying.
- After this lands, any external WPO instance already configured against `x-wpo-workspace` must be updated to send `x-wpo-tenant` and regenerate the secret. Since nothing's live yet, this is documentation-only.
