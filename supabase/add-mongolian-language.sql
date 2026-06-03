alter table public.profiles
  drop constraint if exists profiles_preferred_language_check;

alter table public.profiles
  add constraint profiles_preferred_language_check
  check (preferred_language in ('zh', 'ko', 'en', 'mn'));

alter table public.messages
  drop constraint if exists messages_original_language_check;

alter table public.messages
  add constraint messages_original_language_check
  check (original_language in ('zh', 'ko', 'en', 'mn'));
