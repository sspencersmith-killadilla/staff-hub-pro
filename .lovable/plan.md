## What I found

- The deployed server logs still show the old crash: `column events.wpo_status does not exist`.
- The app does have an Integrations settings route at `/staff/integrations`, but there is no separate `/integration_dispatches` page. Recent sync activity is embedded in that Integrations page and is only reachable from Staff Admin → WorkPlanOS integration.
- `updateEvent` is wired to call `dispatchToWpoSafe`, so the hook exists. The likely issue is that the fix has not been published yet, or the dispatcher still has unlogged schema failure paths.
- The outbound log table was built as `integration_dispatches`, not `wpo_dispatches`, which has made debugging confusing.

## Plan

1. **Make the dispatcher schema-proof**
   - Keep `sessions` as the primary event source.
   - Ensure legacy `events` fallback selects only columns that actually exist.
   - Remove every remaining dependency on `events.wpo_status` and `events.wpo_assignee_id` from outbound code.
   - Ensure *every* dispatcher failure inserts an `integration_dispatches` row with `direction = 'outbound'`, `status_code = null`, and the error message.

2. **Fix the manual resend/retry visibility problem**
   - Add a direct Staff route for sync logs, e.g. `/staff/integration-dispatches`, so there is an obvious “integration dispatches area.”
   - Show the latest 50 outbound rows with `status_code`, `error`, timestamp, event id, and payload preview.
   - Keep retry buttons for failed outbound rows.
   - Add navigation from the Staff/Admin integration area so it is discoverable.

3. **Align naming to the original prompt without breaking existing code**
   - Keep using `integration_dispatches` as the actual table if it already exists.
   - Add UI labels that explicitly say “Outbound WorkPlanOS dispatches” so it is not hidden behind a generic name.
   - Do not create `events.wpo_status` or `events.wpo_assignee_id` columns.

4. **Add diagnostic server-side breadcrumbs**
   - Log a short line when dispatch starts, when it skips because config is missing/disabled, when it POSTs, and when it writes the dispatch row.
   - Keep logs free of secrets and full payload dumps.

5. **Verify with real signal**
   - Use server-function logs after the change to confirm the `events.wpo_status` crash no longer appears.
   - Trigger or use the manual resend path to confirm a new `integration_dispatches` outbound row is created.
   - Confirm the UI page shows that row, including `status_code`, `error`, and payload preview.

## Acceptance criteria

- Updating a TESS staff event creates an `integration_dispatches` row with `direction = 'outbound'`.
- If WorkPlanOS rejects or is unreachable, the row still exists with `status_code`/`error` and a retry time.
- The dispatcher no longer queries non-existent WPO columns on `events`.
- There is a visible staff page for outbound dispatch activity.
- WPO receives the POST when `workplanos_integration.enabled = true`, `wpo_base_url` is correct, and `shared_secret` is set.