## What's happening

The toast "Forbidden" comes from the server. In both `src/lib/surveys.functions.ts` and `src/lib/campaigns.functions.ts`, the `assertStaff()` helper only accepts users that have a row in `public.user_roles` with role `admin` or `staff`:

```ts
// surveys.functions.ts / campaigns.functions.ts
async function assertStaff(supabase, userId) {
  const { data } = await supabase.from("user_roles")
    .select("role").eq("user_id", userId)
    .in("role", ["admin", "staff"]).maybeSingle();
  if (!data) throw new Error("Forbidden");
}
```

But the UI's "Can I see this page / button?" check (`usePermissions`/`getMyPermissions`) is **more permissive** — it also grants every page permission to users that only have a `department_roles` row with role `dept_admin`, `staff`, or `super_admin`:

```ts
// auth.functions.ts → getMyPermissions
const hasDeptRole = (deptRoles ?? []).some(
  r => r.role === "dept_admin" || r.role === "staff" || r.role === "super_admin",
);
if (hasDeptRole) { for (const p of ALL_PERMISSIONS) global.add(p); }
```

So a department admin/staff user:
- sees `/staff/surveys` and `/staff/communications` (✓ correct),
- sees the **+ New survey / + New campaign** button (✓ correct),
- clicks it → server runs the stricter `assertStaff` against `user_roles` → no row → throws `Forbidden` (✗ inconsistent).

The earlier toast wiring I added is what surfaced the existing problem. The DB tables, RLS, and grants for `surveys`/`communication_campaigns` are fine — a service-role insert succeeds, and the RLS policies allow `has_role(auth.uid(), 'admin' | 'staff')`. The actual blocker is the in-code `assertStaff` checks not recognizing department roles.

(The `manifest.webmanifest 404` line in the console is unrelated cosmetic noise from the published site and not the cause.)

## Fix

Make the server-side staff gate match the UI's permission model: accept either a global `user_roles` entry **or** a `department_roles` entry, in every server function that gates on `assertStaff`.

### Files to change

1. `src/lib/surveys.functions.ts` — rewrite `assertStaff()` to also accept `department_roles` with role in (`dept_admin`, `staff`, `super_admin`). Applies to: `listSurveys`, `getSurveyForEdit`, `saveSurvey`, `deleteSurvey`, `getSurveyAnalytics`.

2. `src/lib/campaigns.functions.ts` — same rewrite of `assertStaff()`. Applies to: `listCampaigns`, `getCampaign`, `saveCampaign`, `deleteCampaign`, `previewAudience`, `dispatchCampaignNow`, `sendTestCampaign`.

3. Check the RLS policies on `public.surveys`, `public.survey_questions`, `public.communication_campaigns`, `public.campaign_recipients` (migration `038_communications_surveys.sql`). They currently say `using/with check: has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'staff')`. If a department-only user reaches an insert, RLS will also reject. Add a migration that updates these four policies to additionally allow `exists (select 1 from public.department_roles where user_id = auth.uid() and role in ('dept_admin','staff','super_admin'))`. Existing `surveys.functions.ts` / `campaigns.functions.ts` writes go through the user-scoped supabase client (RLS applies), so this is required for dept-only users.

### Reference helper shape

```ts
async function assertStaff(supabase: any, userId: string) {
  const [{ data: role }, { data: dept }] = await Promise.all([
    supabase.from("user_roles").select("role")
      .eq("user_id", userId).in("role", ["admin", "staff"]).maybeSingle(),
    supabase.from("department_roles").select("role")
      .eq("user_id", userId).in("role", ["dept_admin", "staff", "super_admin"]).maybeSingle(),
  ]);
  if (!role && !dept) throw new Error("Forbidden");
}
```

### Verification

- Sign in as a department-only user → click **+ New survey** → row is created and the editor opens.
- Sign in as the same user → click **+ New campaign** → same.
- Sign in as a user with no roles at all → button is hidden; if forced, server still returns `Forbidden`.

### Out of scope

- The `manifest.webmanifest` 404 (separate, cosmetic).
- Any rewrite of the permissions model itself.
- The `REPRODUCTION.md` / `README.md` / PDF docs from the prior turn.
