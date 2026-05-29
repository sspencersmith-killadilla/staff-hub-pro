-- Extend vendor applications with selling/licensing/permit/special-requirements info.
alter table public.vendors
  add column if not exists selling_items boolean default false,
  add column if not exists items_description text,
  add column if not exists is_licensed boolean default false,
  add column if not exists permit_urls text[] default '{}'::text[],
  add column if not exists special_requirements text;

-- Public storage bucket for vendor permit uploads (license docs, permits, etc.)
insert into storage.buckets (id, name, public)
values ('vendor-permits', 'vendor-permits', true)
on conflict (id) do update set public = true;

drop policy if exists "vendor-permits public read" on storage.objects;
create policy "vendor-permits public read"
  on storage.objects for select
  using (bucket_id = 'vendor-permits');

drop policy if exists "vendor-permits owner insert" on storage.objects;
create policy "vendor-permits owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-permits'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vendor-permits owner update" on storage.objects;
create policy "vendor-permits owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vendor-permits'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vendor-permits owner delete" on storage.objects;
create policy "vendor-permits owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-permits'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
