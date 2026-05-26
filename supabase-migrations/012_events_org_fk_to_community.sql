-- Re-point events.organization_id FK from the legacy `organizations` table
-- to `community_organizations`, which is the only source of org IDs that
-- the community submission flow uses.

alter table public.events
  drop constraint if exists events_organization_id_fkey;

alter table public.events
  add constraint events_organization_id_fkey
  foreign key (organization_id)
  references public.community_organizations(id)
  on delete set null;
