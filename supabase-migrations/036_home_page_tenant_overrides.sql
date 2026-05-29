-- Per-tenant home page overrides.
-- Adds nullable tenant_id; a NULL row is the global default.
-- Each tenant may have at most one row; there is at most one global row.

alter table public.home_page_content
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

-- Drop legacy singleton constraint so multiple rows can coexist
alter table public.home_page_content
  drop constraint if exists home_page_content_singleton_key;
alter table public.home_page_content
  drop constraint if exists home_page_content_singleton_check;
alter table public.home_page_content
  alter column singleton drop not null;

create unique index if not exists home_page_content_one_global
  on public.home_page_content ((tenant_id is null)) where tenant_id is null;
create unique index if not exists home_page_content_one_per_tenant
  on public.home_page_content (tenant_id) where tenant_id is not null;

-- Extend brand_versions snapshots: allow scope_id to reference a tenant for 'home'
-- (scope_id is already nullable / uuid in 034; no change required)
