alter table public.messages
  add column if not exists reply_quote jsonb;
