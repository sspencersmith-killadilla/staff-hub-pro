-- Public storage bucket for auto-generated submission fallback images.
-- Writes are restricted to the service_role (the server-side admin client).
-- Reads are public so cards/flyers can render the image directly.

insert into storage.buckets (id, name, public)
values ('auto-images', 'auto-images', true)
on conflict (id) do update set public = true;

drop policy if exists "auto-images public read" on storage.objects;
create policy "auto-images public read"
  on storage.objects for select
  using (bucket_id = 'auto-images');

-- Only service_role writes (no anon/authenticated policy on purpose).
drop policy if exists "auto-images service write" on storage.objects;
create policy "auto-images service write"
  on storage.objects for all
  to service_role
  using (bucket_id = 'auto-images')
  with check (bucket_id = 'auto-images');
