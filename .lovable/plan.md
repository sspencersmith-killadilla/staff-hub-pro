The issue is routing structure: `/staff/surveys` and `/staff/communications` are currently acting as parent routes, but they render the list page directly and do not include an `<Outlet />`. When the URL changes to `/staff/surveys/:id` or `/staff/communications/:id`, the parent list route stays on screen and the editor child route has nowhere to render.

Plan:

1. Convert parent routes into layouts
   - Update `src/routes/_authenticated/staff/surveys.tsx` to render only `<Outlet />`.
   - Update `src/routes/_authenticated/staff/communications.tsx` to render only `<Outlet />`.

2. Move the list pages to index child routes
   - Create `src/routes/_authenticated/staff/surveys.index.tsx` containing the current Surveys list/new/delete/edit UI.
   - Create `src/routes/_authenticated/staff/communications.index.tsx` containing the current Communications list/new/delete/edit UI.
   - Use `createFileRoute("/_authenticated/staff/surveys/")` and `createFileRoute("/_authenticated/staff/communications/")` for those index pages.

3. Keep editor pages as the detail routes
   - Leave `src/routes/_authenticated/staff/surveys.$id.tsx` as the actual survey editor.
   - Leave `src/routes/_authenticated/staff/communications.$id.tsx` as the actual campaign editor.
   - This will make the existing Edit buttons and post-create navigation render the editor forms instead of just changing the URL.

4. Fix survey analytics nesting if needed
   - Because `/staff/surveys/$id/analytics` is nested under the survey detail route, adjust the survey detail route so analytics can render correctly rather than being blocked by the editor route.

5. Verify navigation behavior
   - Confirm `/staff/surveys` shows the survey list.
   - Confirm `/staff/surveys/:id` shows the survey editor with title, department, questions, and save controls.
   - Confirm `/staff/communications` shows the campaign list.
   - Confirm `/staff/communications/:id` shows the campaign editor with subject, body, department, audience, send/test controls.