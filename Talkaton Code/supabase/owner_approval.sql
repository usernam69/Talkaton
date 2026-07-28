-- Add the Talkaton Owner account to the private beta approval queue.
-- Safe to run after beta_requests.sql.

drop policy if exists "Support can view all requests" on public.beta_requests;
drop policy if exists "Support can review requests" on public.beta_requests;
drop policy if exists "Support and owner can view all requests" on public.beta_requests;
drop policy if exists "Support and owner can review requests" on public.beta_requests;

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
