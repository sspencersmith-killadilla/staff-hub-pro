## Re-scope WPO integration: tenant → department

Switch the WorkPlanOS connection from per-tenant to per-department so each department (Parks, Police, etc.) connects its own WPO workspace, managed by that department's `super_admin` / `dept_admin`.

### Database (migration `060_wpo_department_scope.sql`)

1. `workplanos_integration`
   - Drop `tenant_id` column and its index/constraints.
   - Add `department_id uuid not null references public.departments(id) on delete cascade`.
   - Unique index on `(department_id)`.
2. `integration_dispatches`
   - Drop `tenant_id`, add `department_id uuid references public.departments(id) on delete cascade`.
   - Index on `(department_id, created_at desc)`.
3. Replace `public.can_manage_wpo(uuid)`:
   - Signature: `can_manage_wpo(_department_id uuid) returns boolean`, security definer.
   - Returns true if caller is global `admin` (via `has_role`) **or** has `super_admin` / `dept_admin` in `public.department_roles` for that department.
4. Rebuild RLS policies on both tables using the new helper. Re-issue grants (authenticated select/insert/update/delete, service_role all).

### Inbound webhook (`src/routes/api/public/integrations/wpo/inbound.ts`)

- Header changes from `x-wpo-tenant` (and legacy `x-wpo-workspace`) to **`x-wpo-department`**. Look up `workplanos_integration` by `department_id`.
- `integration_dispatches` insert uses `department_id`.
- Optional safety: when an event match is found, verify `events.department_id` equals the integration's `department_id`; otherwise mark `linked: false` and 200.

### Server functions (`src/lib/workplanos.functions.ts`)

- Replace every `tenantId` parameter with `departmentId`.
- `userCanManage(departmentId)` calls the new `can_manage_wpo` RPC.
- `canManageWpoIntegration` returns the list of departments the current user can manage (admin → all departments; otherwise their `super_admin`/`dept_admin` rows). UI uses this to populate the picker.
- All CRUD/secret-rotation/list-dispatches fns are keyed by `departmentId`.

### Staff UI (`src/routes/_authenticated/staff/integrations.tsx`)

- Replace the "Select tenant" picker with a **"Select department"** picker, fed by the manageable-departments list above.
- Empty state when user manages zero departments: "You don't have permission to manage any department integrations."
- Webhook URL helper text updated to mention header `x-wpo-department: <department-id>`.
- All copy: "tenant" → "department" where it refers to the connection scope.

### Out of scope

- No changes to the `tenants` table or branding engine.
- No new departments are created by this work — the user uses existing departments. (If only "Default Department" exists, that's the one that connects.)

### Technical notes

- Migration is destructive for any existing rows in `workplanos_integration` / `integration_dispatches` from the previous tenant-scoped migration (058). Since the feature isn't live yet, the migration will `truncate` both tables before the column swap rather than attempting a tenant→department backfill.
- `has_role` + `department_roles` are already in the schema (migs 019 + earlier roles migration), so no new role plumbing is needed.
