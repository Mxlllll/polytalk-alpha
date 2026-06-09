create table if not exists public.demo_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  join_code text not null unique,
  members jsonb not null default '[]'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.demo_rooms enable row level security;

drop policy if exists "public can read demo rooms" on public.demo_rooms;
drop policy if exists "public can create demo rooms" on public.demo_rooms;
drop policy if exists "public can update demo rooms" on public.demo_rooms;

create policy "public can read demo rooms"
  on public.demo_rooms for select
  to anon, authenticated
  using (true);

create policy "public can create demo rooms"
  on public.demo_rooms for insert
  to anon, authenticated
  with check (true);

create policy "public can update demo rooms"
  on public.demo_rooms for update
  to anon, authenticated
  using (true)
  with check (true);
