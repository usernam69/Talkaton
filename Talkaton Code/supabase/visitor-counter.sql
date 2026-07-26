-- Run this once in the Supabase SQL editor for the Talkaton project.
-- It stores only a random browser ID; no IP address or personal data is recorded.

create table if not exists public.talkaton_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now()
);

alter table public.talkaton_visitors enable row level security;

revoke all on table public.talkaton_visitors from public, anon, authenticated;

create or replace function public.record_unique_visit(p_visitor_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  visitor_total bigint;
begin
  insert into public.talkaton_visitors (visitor_id)
  values (p_visitor_id)
  on conflict (visitor_id) do nothing;

  select count(*) into visitor_total
  from public.talkaton_visitors;

  return visitor_total;
end;
$$;

revoke all on function public.record_unique_visit(uuid) from public;
grant execute on function public.record_unique_visit(uuid) to anon, authenticated;
