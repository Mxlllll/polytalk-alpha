insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-files',
  'room-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'text/plain'
  ]
)
on conflict (id) do nothing;

drop policy if exists "room members can upload room files" on storage.objects;
drop policy if exists "room members can read room files" on storage.objects;

create policy "room members can upload room files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'room-files'
    and public.is_room_member((storage.foldername(name))[1]::uuid)
  );

create policy "room members can read room files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'room-files'
    and public.is_room_member((storage.foldername(name))[1]::uuid)
  );
