-- How each invited person may get in, and when their access code stops working (D-017).
-- access_type: 'code' = access code only, 'email' = their email only, 'all' = either.
-- Both methods end the same way: a 6-digit code emailed to the address on the allowlist.

alter table public.allowlist
  add column access_type text not null default 'all' check (access_type in ('code', 'email', 'all')),
  add column access_code_expires_at timestamptz;

-- People who already have accounts sign in with their email.
update public.allowlist set access_type = 'email' where access_code is null;

drop function if exists public.invite_lookup(text, text);
create function public.invite_lookup(lookup_email text default null, lookup_code text default null)
returns table (
  email text, first_name text, last_name text, access_type text, code_expires_at timestamptz,
  account_exists boolean, account_confirmed boolean
)
language sql stable security definer set search_path = '' as $$
  select a.email, a.first_name, a.last_name, a.access_type, a.access_code_expires_at,
    exists (select 1 from auth.users u where lower(u.email) = a.email and u.deleted_at is null),
    exists (select 1 from auth.users u where lower(u.email) = a.email and u.deleted_at is null and u.email_confirmed_at is not null)
  from public.allowlist a
  where (lookup_code is not null and a.access_code = upper(btrim(lookup_code)))
     or (lookup_code is null and a.email = lower(btrim(lookup_email)))
  limit 1;
$$;
revoke all on function public.invite_lookup(text, text) from public, anon, authenticated;
grant execute on function public.invite_lookup(text, text) to service_role;
