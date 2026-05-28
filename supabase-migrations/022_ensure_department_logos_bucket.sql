-- Idempotent re-creation of the department-logos storage bucket and policies.
-- Migration 020 may not have been applied; this guarantees the bucket exists
-- so admins can upload department logos from /staff/admin/departments.

insert into storage.buckets (id, name, public)
values ('department-logos', 'department-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "department-logos public read" on storage.objects;
create policy "department-logos public read"
  on storage.objects for select
  using (bucket_id = 'department-logos');

drop policy if exists "department-logos admin insert" on storage.objects;
create policy "department-logos admin insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'department-logos'
    and public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "department-logos admin update" on storage.objects;
create policy "department-logos admin update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'department-logos'
    and public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "department-logos admin delete" on storage.objects;
create policy "department-logos admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'department-logos'
    and public.has_role(auth.uid(), 'admin')
  );
