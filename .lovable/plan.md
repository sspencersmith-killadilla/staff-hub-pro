## Goal

Make ticket assignment actually do something: grant scoped access, notify the assignee, surface their work, and (for raw-email invites) email them a signup link.

## 1. Auto-grant scoped staff access on assignment

When `assignTicket` runs (or when `claim_ticket_assignee_invites` fires after a late signup):

- Ensure the assignee has the **`staff`** app role (insert into `user_roles` if missing — never elevate to `admin`).
- Add the assignee as a **`viewer`** member of every department currently on `ticket_departments` for that ticket (insert into the existing department-membership table, skip if already a member at viewer-or-higher).
- Both writes happen via a new SECURITY DEFINER SQL function `grant_assignee_access(ticket_id, user_id)` called from the server fn and from the email-claim trigger.

Result: assignees show up on the dispatch board (which already filters by department), can read ticket detail, updates, costs, and the linked asset.

**Out of scope:** no write/admin escalation. Viewer access is the floor; admins can promote individuals later through the normal staff UI.

## 2. Email invite for unknown emails

In `assignTicket`, when the input resolves to a raw `invited_email`:

- Send a single app email via Lovable's email infra (`sendTransactionalEmail`) to that address with a "You've been assigned a 311 report" template containing the ticket category, short description, and a signup link to `/signup?invite=ticket&redirect=/staff/dispatch`.
- Use `idempotencyKey = ticket-assignee-invite-<assignee_row_id>` so re-inviting the same email on the same ticket doesn't resend.
- On signup, the existing `claim_ticket_assignee_invites` trigger links the row; we extend it to also call `grant_assignee_access`.

Prerequisite: confirm Lovable Cloud email domain is set up; if not, run the standard email setup before scaffolding the template.

## 3. "Assigned to me" on the dispatch board

In `listDispatchTickets`:

- Add a new server fn `listTicketsAssignedToMe` that returns tickets where `ticket_assignees.staff_user_id = auth.uid()` and `accepted_at is not null`, regardless of department membership (RLS still applies via the new viewer membership from step 1, so this is consistent).
- Dispatch board gets a filter pill: **All / Assigned to me / Unassigned**. The "Assigned to me" count is shown as a badge next to the pill.

## 4. "My 311 Assignments" card in `/hub` — staff-only

In `src/routes/_authenticated/hub.tsx`:

- Add a new card `MyAssignmentsCard` rendered **only when `isStaff` is true** (the hook already exposes `isStaff = roles.includes('staff') || roles.includes('admin')`). Wrap the JSX in `{isStaff && (...)}` so citizens never see it, even if they somehow have a pending invite row.
- The card uses `useQuery` over a new server fn `countMyOpenAssignments` (returns `{ open, in_progress }`). Numbers + a "Open dispatch" link to `/staff/dispatch?assignee=me`.
- Also gate by `isEnabled('tickets_311')` if that module key exists; otherwise unconditional for staff.

## 5. Optional notifications (lightweight)

- On `assignTicket` for an existing staff user: send an app email "You were assigned ticket #…" using the same email infra, idempotency keyed on assignee row id.
- On `addTicketUpdate` with `status_change`: send an email to every accepted assignee on that ticket (idempotency key per update id + assignee).
- No in-app toast/realtime push in this pass — keep scope tight. (Realtime is already enabled on the tables; a future pass can subscribe.)

## Files touched

- `supabase-migrations/054_311_assignment_access.sql` — new: `grant_assignee_access` fn + extend `claim_ticket_assignee_invites` trigger to call it; backfill grants for existing accepted assignees.
- `src/lib/tickets.functions.ts` — extend `assignTicket` to call `grant_assignee_access` + send invite/notification email; add `listTicketsAssignedToMe`, `countMyOpenAssignments`.
- `src/components/tickets/TicketDetailDrawer.tsx` — copy update: "Assigning grants viewer access to this ticket's department(s)."
- `src/routes/_authenticated/staff/dispatch.tsx` (or wherever the board lives) — add Assigned-to-me / Unassigned filter pills.
- `src/routes/_authenticated/hub.tsx` — add `MyAssignmentsCard`, render only when `isStaff`.
- `src/lib/email-templates/ticket-assignment-invite.tsx` — new email template (only if email infra is already configured; otherwise run setup first).
- `src/lib/email-templates/ticket-assignment-notification.tsx` — new email template for already-staff assignees + status updates.
- `src/lib/email-templates/registry.ts` — register new templates.

## Out of scope

- No new department or role types.
- No changes to citizen-facing flows or `/my-reports`.
- No realtime push, browser notifications, or SMS.
- No bulk reassignment or escalation rules.
