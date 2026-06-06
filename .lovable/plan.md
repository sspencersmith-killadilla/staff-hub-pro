## Goal
Make **New survey** and **New campaign** work for users who can see those pages through department/staff permissions, without weakening access control.

## Root cause to fix
The UI allows access when `getMyPermissions()` finds a department role, but the create server functions still rely on a narrower inline staff check. If the user’s department role is not visible through RLS, or if the user only has granular `page.surveys` / `page.communications` permission, the backend still throws `Forbidden`.

## Plan
1. **Unify the backend staff guard**
   - Update the shared `src/lib/staff-guard.ts` helper to recognize:
     - global `user_roles`: `admin`, `staff`
     - department roles: `super_admin`, `dept_admin`, `staff`
     - explicit page permissions when relevant
   - Use admin-side server access inside the guard so the check is not blocked by `department_roles` RLS visibility.

2. **Apply the guard to surveys and campaigns**
   - Replace the duplicate inline `assertStaff()` functions in:
     - `src/lib/surveys.functions.ts`
     - `src/lib/campaigns.functions.ts`
   - For survey creation/list/edit/delete, require `page.surveys` or staff/department role.
   - For campaign creation/list/edit/delete, require `page.communications` or staff/department role.

3. **Add a follow-up database migration**
   - Create a new migration that broadens RLS policies using the existing department-role helpers instead of relying only on `user_roles`.
   - This ensures inserts/updates/deletes on `surveys`, `survey_questions`, `communication_campaigns`, `campaign_recipients`, and survey response admin reads match the backend guard.

4. **Improve the visible failure message**
   - Keep `Forbidden` for true access denial, but make permission check failures clearer in server logs and UI to separate “no role/permission” from database policy errors.

5. **Ignore the manifest 404 for this fix**
   - The missing `manifest.webmanifest` is unrelated to survey/campaign creation. I’ll leave it untouched unless you want a separate PWA/manifest fix.

## Validation
- Confirm the updated functions no longer have duplicate narrow staff checks.
- Verify the new SQL migration includes grants/policies where needed.
- After implementation, you’ll need to apply the new migration to the live database; then department-scoped staff should be able to create surveys and campaigns.