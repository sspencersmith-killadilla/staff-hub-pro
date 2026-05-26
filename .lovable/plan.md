## Problem
Submitting a community event fails with:
`insert or update on table "events" violates foreign key constraint "events_organization_id_fkey"`

`src/lib/community-public.functions.ts` (createMyCommunityEvent) inserts into `events` with `organization_id = community_organizations.id`. The existing FK on `events.organization_id` still points to the legacy `public.organizations` table, where that UUID does not exist.

City-controlled events have moved to the `sessions` table, so the `events` table is now used exclusively for community events. The FK should reference `community_organizations` instead.

## Fix
Add a migration that re-targets the FK:

```sql
-- supabase-migrations/012_events_org_fk_to_community.sql
alter table public.events
  drop constraint if exists events_organization_id_fkey;

alter table public.events
  add constraint events_organization_id_fkey
  foreign key (organization_id)
  references public.community_organizations(id)
  on delete set null;
```

No application code changes are needed — `createMyCommunityEvent`, `updateMyCommunityEvent`, the staff moderation views, and the public listing already use `community_organizations.id`.

## Verification
1. Submit a new community event from `/community/manage?org=<approved-org-id>` — insert succeeds, event appears in "Pending" for staff.
2. Existing community events still load on the staff Community Events page and the public events list (same column, same IDs).
3. Deleting a community organization sets `events.organization_id` to NULL on its events instead of cascading (matches the "events stay for audit" intent; can switch to `on delete cascade` if you'd rather purge them — tell me which you prefer).