create table if not exists public.history_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  title text not null,
  join_code text not null default '',
  ended_at timestamptz not null default now(),
  members jsonb not null default '[]'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  ai_results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists history_records_owner_ended_at_idx
  on public.history_records(owner_id, ended_at desc);

alter table public.history_records enable row level security;

drop policy if exists "users can read their own history" on public.history_records;
drop policy if exists "users can create their own history" on public.history_records;
drop policy if exists "users can update their own history" on public.history_records;
drop policy if exists "users can delete their own history" on public.history_records;

create policy "users can read their own history"
  on public.history_records for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "users can create their own history"
  on public.history_records for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "users can update their own history"
  on public.history_records for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "users can delete their own history"
  on public.history_records for delete
  to authenticated
  using (auth.uid() = owner_id);
