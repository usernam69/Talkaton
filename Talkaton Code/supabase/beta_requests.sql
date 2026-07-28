-- Talkaton custom request and approval queue
-- Run once in the Supabase SQL Editor for project cxulgeojkjnskdyoktkj.

create table if not exists public.beta_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  requester_name text not null,
  feature_key text not null,
  title text not null,
  details text not null,
  status text not null default 'pending',
  admin_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_requests_feature_key_check
    check (feature_key in ('beta_lab', 'dev_access', 'model_access', 'tool_access', 'custom')),
  constraint beta_requests_status_check
    check (status in ('pending', 'approved', 'declined')),
  constraint beta_requests_name_length
    check (char_length(requester_name) between 1 and 80),
  constraint beta_requests_title_length
    check (char_length(title) between 3 and 120),
  constraint beta_requests_details_length
    check (char_length(details) between 10 and 2000)
);

alter table public.beta_requests
  add column if not exists access_expires_at timestamptz;

alter table public.beta_requests
  drop constraint if exists beta_requests_feature_key_check;

alter table public.beta_requests
  add constraint beta_requests_feature_key_check
  check (feature_key in ('beta_lab', 'dev_access', 'model_access', 'tool_access', 'custom'));

create index if not exists idx_beta_requests_user_created
  on public.beta_requests (user_id, created_at desc);

create index if not exists idx_beta_requests_status_created
  on public.beta_requests (status, created_at desc);

alter table public.beta_requests enable row level security;

create or replace function public.has_active_beta_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.beta_requests
    where user_id = p_user_id
      and feature_key = 'beta_lab'
      and status = 'approved'
      and (access_expires_at is null or access_expires_at > now())
  );
$$;

revoke all on function public.has_active_beta_access(uuid) from public;
grant execute on function public.has_active_beta_access(uuid) to authenticated;

drop policy if exists "Users can submit their own requests" on public.beta_requests;
drop policy if exists "Users can view their own requests" on public.beta_requests;
drop policy if exists "Users can delete their pending requests" on public.beta_requests;
drop policy if exists "Support can view all requests" on public.beta_requests;
drop policy if exists "Support can review requests" on public.beta_requests;
drop policy if exists "Support and owner can view all requests" on public.beta_requests;
drop policy if exists "Support and owner can review requests" on public.beta_requests;

create policy "Users can submit their own requests"
  on public.beta_requests
  for insert
  with check (
    auth.uid() = user_id
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower(user_email)
    and status = 'pending'
    and admin_note is null
    and reviewed_by is null
    and reviewed_at is null
    and access_expires_at is null
    and (
      feature_key <> 'dev_access'
      or public.has_active_beta_access(auth.uid())
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'beta', 'false') = 'true'
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'beta_approved', 'false') = 'true'
    )
  );

create policy "Users can view their own requests"
  on public.beta_requests
  for select
  using (auth.uid() = user_id);

create policy "Users can delete their pending requests"
  on public.beta_requests
  for delete
  using (auth.uid() = user_id and status = 'pending');

create policy "Support and owner can view all requests"
  on public.beta_requests
  for select
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'supportaton@gmail.com',
      'kantertal1@gmail.com'
    )
  );

create policy "Support and owner can review requests"
  on public.beta_requests
  for update
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'supportaton@gmail.com',
      'kantertal1@gmail.com'
    )
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'supportaton@gmail.com',
      'kantertal1@gmail.com'
    )
  );

create or replace function public.set_beta_request_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_set_beta_request_updated_at on public.beta_requests;

create trigger trigger_set_beta_request_updated_at
  before update on public.beta_requests
  for each row
  execute function public.set_beta_request_updated_at();
