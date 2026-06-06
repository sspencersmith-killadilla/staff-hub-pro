# Make surveys & campaigns actually manageable

The editor pages already exist (`/staff/surveys/$id` and `/staff/communications/$id`) and the DB has a `department_id` on both tables, but:
- The list rows look like rows, not actionable items — no explicit "Edit" affordance.
- Neither editor exposes a Department assignment control, so a newly-created "Untitled" item can't be tied to a department.
- A few small UX gaps (campaign editor missing a Back/Save header, no rename inline on the list, etc.) make it feel like you can only create-then-nothing.

## Changes

### 1. Surveys list (`src/routes/_authenticated/staff/surveys.tsx`)
- Add an explicit **Edit** button on each row (in addition to keeping the title clickable).
- Show the department name next to each survey when assigned.
- Inline-rename pencil that updates `title` via `saveSurvey` without opening the editor.

### 2. Survey editor (`src/routes/_authenticated/staff/surveys.$id.tsx`)
- Add a **Department** select (populated from `listAssignableDepartments()`), bound to `department_id`, with an "Unassigned" option.
- Pass `department_id` through `saveSurvey` (server fn already accepts it).
- Show a clearer header: "Editing: <title>" so it's obvious you're on the edit page.

### 3. Communications list (`src/routes/_authenticated/staff/communications.tsx`)
- Add an explicit **Edit** button per row.
- Show department + audience summary on each row.
- Inline-rename for `subject`.

### 4. Campaign editor (`src/routes/_authenticated/staff/communications.$id.tsx`)
- Add a top header with Back + **Save** (currently Save lives only in the sidebar — easy to miss).
- Add a **Department** select bound to `department_id`.
- Show editing title prominently.

### 5. Server functions
- No schema changes required — `department_id` already validated by both `SaveSurveySchema` and the campaign `SaveSchema`.
- No new server functions; reuse `listAssignableDepartments()` already used by the campaign audience picker.

### 6. Permissions/RLS
- No changes. The existing `assertStaff(userId, "page.surveys" | "page.communications")` guard already covers edit/save. Migration 041 (already drafted) remains the source of truth for RLS; this plan doesn't depend on schema changes.

## Out of scope
- Survey response export / per-respondent management (analytics page already exists).
- Re-sending sent campaigns or duplicating campaigns.
- Editing the manifest 404 noise in the console.
