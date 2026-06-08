# 311 Module Upgrades

## 1. Assignment to staff (with email invite)
- New table `ticket_assignees`: `ticket_id`, `staff_user_id` (nullable), `invited_email` (nullable), `assigned_by`, `assigned_at`, `accepted_at`.
- Dispatch detail drawer: searchable picker of existing staff (shows name + email). "Invite by email" field for unknown addresses.
- Inviting a raw email:
  - If the email matches an existing auth user → link as `staff_user_id`.
  - Otherwise insert pending row with `invited_email`, send notification email via existing Lovable email infra with a sign-in link; on first sign-in the row is auto-claimed (matched by email).
- Primary assignee = first row; "My assigned tickets" view on staff dashboard filtered by `auth.uid()`.

## 2. Multi-department assignment
- New table `ticket_departments`: `ticket_id`, `department_id`, `is_primary`, `added_by`. Keep legacy `tickets.assigned_department_id` as the primary mirror for backward compatibility (trigger keeps it in sync with `is_primary=true`).
- Dispatch UI: multi-select department chips on the ticket. RLS broadened so any linked department's staff can read/write.
- `can_read/write_department` checks updated to also consult `ticket_departments`.

## 3. Duplicate detection (staff-only linking)
- New table `ticket_duplicates`: `primary_ticket_id`, `duplicate_ticket_id`, `linked_by`, `linked_at`, unique on the pair.
- Detail drawer "Possible duplicates" panel: server fn returns tickets with same `category_id`, within ~150m (Haversine on lat/lng), created within ±30 days, not already resolved. Staff click "Link as duplicate of…" or "Mark this as primary".
- A ticket marked duplicate gets status auto-mirrored from its primary (trigger), and updates posted on the primary surface on the citizen view of the duplicate too.
- Dispatch board shows a small badge (`+N`) on tickets with linked duplicates.

## 4. Asset catalog + history
- New tables:
  - `assets`: `id`, `name`, `asset_type` (enum: streetlight, sign, hydrant, bench, tree, playground, other), `external_ref`, `address`, `latitude`, `longitude`, `install_date`, `department_id`, `notes`, `active`.
  - `tickets.asset_id` (nullable FK).
- Dispatch detail drawer: asset picker with auto-suggest — server fn returns nearest active assets within 100m, optionally filtered by category→asset_type mapping. Staff can also create a new asset on the fly.
- New staff route `/staff/assets`: searchable list + asset detail page showing all tickets ever linked, total cost, last service date.

## 5. Labor & repair cost tracking
- New table `ticket_costs`: `id`, `ticket_id`, `kind` (enum: labor, materials, equipment, other), `description`, `hours` (nullable), `rate` (nullable), `amount` (computed: `coalesce(hours*rate, 0) + materials_amount`), `incurred_on`, `logged_by`, `created_at`. Simplified: store `amount` directly plus optional `hours`/`rate` for labor.
- Detail drawer "Costs" tab: add line items, see running total. Resolved view shows breakdown.
- Asset detail rolls up lifetime cost = sum of `ticket_costs.amount` across all linked tickets.

## 6. Staff dashboard tweaks
- Dispatch page filters: by assignee (me / anyone / unassigned), by department (multi), by duplicate-of-primary toggle.
- Ticket card shows assignee avatar/initials + dept chips + cost total + asset name when set.

## Technical notes
- All new tables: GRANTs to `authenticated` + `service_role`, RLS scoped via `is_department_super_admin` and the new multi-dept helpers.
- Realtime publication added for `ticket_assignees`, `ticket_departments`, `ticket_duplicates`, `ticket_costs`.
- New server functions in `src/lib/tickets.functions.ts` (and a new `src/lib/assets.functions.ts`): `assignTicket`, `unassignTicket`, `inviteAssigneeByEmail`, `setTicketDepartments`, `findPossibleDuplicates`, `linkDuplicate`, `unlinkDuplicate`, `suggestAssetsForTicket`, `linkAssetToTicket`, `createAsset`, `listAssets`, `getAssetHistory`, `addTicketCost`, `deleteTicketCost`.
- Citizen-facing `/my-reports` and `/report` flows are unchanged except duplicates surface a "Linked to existing report" banner on the tracker.
- One migration file `053_tickets_311_upgrades.sql` containing all schema + RLS + grants + triggers.
