-- Invite-only accounts by access code, email codes only (D-018).
-- The operator adds a person to the allowlist with their name, email and an access code. The person redeems the
-- code on /signup; Poxeet emails a 6-digit code to the address on file. Sign-in is email plus code, allowlisted only.

-- 1. No passwords: remove the helpers an earlier draft of 202610150001 created.
drop function if exists public.account_auth_state(text);
drop function if exists public.my_has_password();
drop function if exists public.verify_my_password(text);

-- 2. The allowlist carries who the person is and their access code.
alter table public.allowlist
  add column first_name text,
  add column last_name text,
  add column access_code text,
  add column redeemed_at timestamptz,
  add constraint allowlist_access_code_format check (access_code is null or access_code ~ '^[A-Z0-9-]{4,32}$');
create unique index allowlist_access_code_key on public.allowlist (access_code) where access_code is not null;

-- 3. Names on profiles, filled from the allowlist at sign-up.
alter table public.profiles add column first_name text, add column last_name text;
update public.profiles set
  first_name = nullif(split_part(btrim(display_name), ' ', 1), ''),
  last_name = nullif(btrim(substr(btrim(display_name), length(split_part(btrim(display_name), ' ', 1)) + 1)), '')
where display_name is not null;

-- Everyone who already has an account stays able to sign in.
insert into public.allowlist (email, role, master_key_access, first_name, last_name, redeemed_at)
select p.email, p.role, p.master_key_access, p.first_name, p.last_name, p.created_at from public.profiles p
on conflict (email) do nothing;

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare invited public.allowlist%rowtype;
begin
  select * into invited from public.allowlist a where a.email = lower(btrim(new.email));
  insert into public.profiles (id, email, display_name, first_name, last_name, role, master_key_access)
  values (
    new.id, lower(btrim(new.email)),
    coalesce(nullif(btrim(concat_ws(' ', invited.first_name, invited.last_name)), ''), nullif(new.raw_user_meta_data ->> 'full_name', '')),
    invited.first_name, invited.last_name,
    coalesce(invited.role, 'member'), coalesce(invited.master_key_access, 'none')
  );
  return new;
end;
$$;

-- 4. Sign-up is by invitation. The auth.users trigger rejects any email not on the allowlist.
update public.instance_settings set signup_mode = 'invite_only' where id;

-- 5. Server-only lookups for the sign-in and sign-up forms, called with the secret key.
-- By access code (sign-up) or by email (sign-in). account_confirmed means the person has verified a code before.
create or replace function public.invite_lookup(lookup_email text default null, lookup_code text default null)
returns table (email text, first_name text, last_name text, account_exists boolean, account_confirmed boolean)
language sql stable security definer set search_path = '' as $$
  select a.email, a.first_name, a.last_name,
    exists (select 1 from auth.users u where lower(u.email) = a.email and u.deleted_at is null),
    exists (select 1 from auth.users u where lower(u.email) = a.email and u.deleted_at is null and u.email_confirmed_at is not null)
  from public.allowlist a
  where (lookup_code is not null and a.access_code = upper(btrim(lookup_code)))
     or (lookup_code is null and a.email = lower(btrim(lookup_email)))
  limit 1;
$$;
revoke all on function public.invite_lookup(text, text) from public, anon, authenticated;
grant execute on function public.invite_lookup(text, text) to service_role;

-- 6. Attempt limiter for those lookups, keyed by a hash of the client IP. Server only.
create table public.auth_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_lookup on public.auth_attempts (key, kind, created_at);
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;

-- Records an attempt and says whether it is within the limit for the window.
create or replace function public.take_auth_attempt(attempt_key text, attempt_kind text, max_attempts integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare recent integer;
begin
  delete from public.auth_attempts where created_at < now() - interval '1 day';
  select count(*) into recent from public.auth_attempts
  where key = attempt_key and kind = attempt_kind and created_at > now() - make_interval(secs => window_seconds);
  if recent >= max_attempts then return false; end if;
  insert into public.auth_attempts (key, kind) values (attempt_key, attempt_kind);
  return true;
end;
$$;
revoke all on function public.take_auth_attempt(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_auth_attempt(text, text, integer, integer) to service_role;
