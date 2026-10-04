-- Trusted Beta access, Dev Access, custom expiration, and Owner/Support review.
-- Run once in the Supabase SQL Editor after the original beta_requests table exists.

alter table public.beta_requests
  add column if not exists access_expires_at timestamptz;

alter table public.beta_requests
  drop constraint if exists beta_requests_feature_key_check;

alter table public.beta_requests
  add constraint beta_requests_feature_key_check
  check (feature_key in ('beta_lab', 'dev_access', 'model_access', 'tool_access', 'custom'));

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
