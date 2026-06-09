alter table public.messages
  add column if not exists voice_url text;

alter table public.messages
  add column if not exists voice_duration integer;

alter table public.messages
  drop constraint if exists messages_kind_check;

alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'voice', 'file_summary', 'discussion_summary'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-messages',
  'voice-messages',
  true,
  10485760,
  array[
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg'
  ]
)
on conflict (id) do nothing;

drop policy if exists "room members can upload voice messages" on storage.objects;
drop policy if exists "public can read voice messages" on storage.objects;

create policy "room members can upload voice messages"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'voice-messages'
    and public.is_room_member((storage.foldername(name))[1]::uuid)
  );

create policy "public can read voice messages"
  on storage.objects for select
  to public
  using (bucket_id = 'voice-messages');
