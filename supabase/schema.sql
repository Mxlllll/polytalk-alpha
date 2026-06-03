create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  school_email text not null,
  preferred_language text not null check (preferred_language in ('zh', 'ko', 'en', 'mn')),
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  join_code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'file_summary', 'discussion_summary')),
  original_language text not null check (original_language in ('zh', 'ko', 'en', 'mn')),
  original_text text not null,
  translations jsonb not null default '{}'::jsonb,
  attachment_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.messages
  add constraint messages_attachment_id_fkey
  foreign key (attachment_id) references public.attachments(id) on delete set null;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;

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

create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "members can read rooms"
  on public.rooms for select
  to authenticated
  using (created_by = auth.uid() or public.is_room_member(id));

create policy "authenticated users can find rooms by join code"
  on public.rooms for select
  to authenticated
  using (true);

create policy "authenticated users can create rooms"
  on public.rooms for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "members can read memberships"
  on public.room_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_room_member(room_id));

create policy "users can join rooms as themselves"
  on public.room_members for insert
  to authenticated
  with check (auth.uid() = user_id);

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
