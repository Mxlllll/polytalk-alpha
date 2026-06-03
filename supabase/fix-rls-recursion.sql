create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members
    where room_members.room_id = target_room_id
    and room_members.user_id = auth.uid()
  );
$$;

drop policy if exists "members can read rooms" on public.rooms;
drop policy if exists "authenticated users can find rooms by join code" on public.rooms;
drop policy if exists "members can read memberships" on public.room_members;
drop policy if exists "members can read messages" on public.messages;
drop policy if exists "members can send messages" on public.messages;
drop policy if exists "members can read attachments" on public.attachments;
drop policy if exists "members can create attachments" on public.attachments;

create policy "members can read rooms"
  on public.rooms for select
  to authenticated
  using (created_by = auth.uid() or public.is_room_member(id));

create policy "authenticated users can find rooms by join code"
  on public.rooms for select
  to authenticated
  using (true);

create policy "members can read memberships"
  on public.room_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_room_member(room_id));

create policy "members can read messages"
  on public.messages for select
  to authenticated
  using (public.is_room_member(room_id));

create policy "members can send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_room_member(room_id)
  );

create policy "members can read attachments"
  on public.attachments for select
  to authenticated
  using (public.is_room_member(room_id));

create policy "members can create attachments"
  on public.attachments for insert
  to authenticated
  with check (
    auth.uid() = uploader_id
    and public.is_room_member(room_id)
  );
