alter table public.messages
  drop constraint if exists messages_kind_check;

alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'voice', 'file', 'file_summary', 'discussion_summary'));

drop policy if exists "senders can update their messages" on public.messages;

create policy "senders can update their messages"
  on public.messages for update
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_room_member(room_id)
  )
  with check (
    auth.uid() = sender_id
    and public.is_room_member(room_id)
  );

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_members'
    ) then
      alter publication supabase_realtime add table public.room_members;
    end if;
  end if;
end $$;
