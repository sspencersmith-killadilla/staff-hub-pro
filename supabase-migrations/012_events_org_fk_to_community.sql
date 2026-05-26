-- Re-point events.organization_id FK from the legacy `organizations` table
-- to `community_organizations`, which is the only source of org IDs that
-- the community submission flow uses.
--
-- First null-out any rows whose organization_id no longer exists in
-- community_organizations, otherwise adding the new FK fails with 23503.

update public.events e
   set organization_id = null
 where organization_id is not null
   and not exists (
     select 1 from public.community_organizations co
      where co.id = e.organization_id
   );

alter table public.events
  drop constraint if exists events_organization_id_fkey;

alter table public.events
  add constraint events_organization_id_fkey
  foreign key (organization_id)
  references public.community_organizations(id)
  on delete set null;
