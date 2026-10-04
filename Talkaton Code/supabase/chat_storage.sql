-- Talkaton cloud chat storage
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New Query → paste → Run).

-- 1. Table: one row per user storing all chat data as JSONB.
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  chats      jsonb not null default '[]'::jsonb,
  memory     jsonb not null default '[]'::jsonb,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Index for fast lookups (primary key already indexes user_id, but this
--    speeds up common queries that sort by updated_at).
create index if not exists idx_user_data_updated_at on public.user_data (updated_at desc);

-- 3. Row Level Security: users can only touch their own row.
alter table public.user_data enable row level security;

drop policy if exists "Users can read their own data"  on public.user_data;
drop policy if exists "Users can insert their own data" on public.user_data;
drop policy if exists "Users can update their own data" on public.user_data;

create policy "Users can read their own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own data"
  on public.user_data for update
  using (auth.uid() = user_id);

-- 4. Auto-update updated_at on every write so we always know when data changed.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_set_updated_at on public.user_data;

create trigger trigger_set_updated_at
  before update on public.user_data
  for each row
  execute function public.set_updated_at();
