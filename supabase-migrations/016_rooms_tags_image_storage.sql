-- Rooms: image_url, description, tags (max 4) + public storage bucket
-- Safe to re-run.

alter table public.rooms
  add column if not exists image_url text,
  add column if not exists description text,
  add column if not exists tags text[] not null default '{}';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_tags_max_4') then
    alter table public.rooms
      add constraint rooms_tags_max_4
      check (array_length(tags, 1) is null or array_length(tags, 1) <= 4);
  end if;
end $$;

-- Public storage bucket for room photos
insert into storage.buckets (id, name, public)
values ('room-images', 'room-images', true)
on conflict (id) do update set public = true;

-- Storage policies (idempotent)
drop policy if exists "room-images public read" on storage.objects;
create policy "room-images public read"
  on storage.objects for select
  using (bucket_id = 'room-images');

drop policy if exists "room-images staff insert" on storage.objects;
create policy "room-images staff insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-images'
    and (public.has_role(auth.uid(), 'staff') or public.has_role(auth.uid(), 'admin'))
  );

drop policy if exists "room-images staff update" on storage.objects;
create policy "room-images staff update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'room-images'
    and (public.has_role(auth.uid(), 'staff') or public.has_role(auth.uid(), 'admin'))
  );

drop policy if exists "room-images staff delete" on storage.objects;
create policy "room-images staff delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'room-images'
    and (public.has_role(auth.uid(), 'staff') or public.has_role(auth.uid(), 'admin'))
  );
