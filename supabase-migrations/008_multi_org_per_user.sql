-- Allow a single user to register multiple community organizations.
-- Drops the unique(user_id) constraint that previously enforced 1:1.

alter table public.community_organizations
  drop constraint if exists community_organizations_user_id_key;

create index if not exists idx_community_orgs_user_id
  on public.community_organizations(user_id);
