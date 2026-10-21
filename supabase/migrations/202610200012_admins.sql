-- Admins live in a table of their own (D-032), not in profiles.role. Admin accounts are admin only: they get no
-- member profile and no workspace. Each admin has an access code, entered after the emailed sign-in code; only a
-- hash of it is stored (scrypt over an HMAC with a server-only secret, lib/admin/code.ts). Members' database roles
-- get no access to this table at all, so a hole in profiles or its policies can't make anyone an admin.

create table public.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email))),
  name text not null,
  -- Set when the invited admin first signs in.
  user_id uuid unique references auth.users(id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  code_hash text not null,
  -- The code was set by someone else (an invite or a reset): it must be changed at the next sign-in.
  must_change_code boolean not null default true,
  code_changed_at timestamptz not null default now(),
  timezone text not null default 'UTC',
  invited_by uuid references public.admins(id) on delete set null,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Audit entries about an admin name the admins row (an invited admin has no user yet).
alter table public.admin_audit_logs add column target_admin_id uuid references public.admins(id) on delete set null;

-- 1. Sign-up lets an invited admin's email through, whatever the sign-up mode.
create or replace function public.enforce_invite_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare user_email text := lower(btrim(new.email));
begin
  if exists (select 1 from public.admins a where a.email = user_email and a.status <> 'disabled') then
    return new;
  end if;
  if (select s.signup_mode from public.instance_settings s where s.id) = 'invite_only' and (
    new.email is null or not exists (select 1 from public.allowlist a where a.email = user_email)
  ) then
    raise exception 'Sign-up on this instance is by invitation.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare user_email text;
begin
  user_email := lower(btrim(event -> 'user' ->> 'email'));
  if exists (select 1 from public.admins a where a.email = user_email and a.status <> 'disabled') then
    return event;
  end if;
  if (select s.signup_mode from public.instance_settings s where s.id) = 'invite_only' and (
    user_email is null or not exists (select 1 from public.allowlist a where a.email = user_email)
  ) then
    raise exception 'Sign-up on this instance is by invitation.' using errcode = '42501';
  end if;
  return event;
end;
$$;

-- 2. Admin accounts get no member profile, so they have no workspace and never show as members.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare invited public.allowlist%rowtype;
begin
  if exists (select 1 from public.admins a where a.email = lower(btrim(new.email))) then
    return new;
  end if;
  select * into invited from public.allowlist a where a.email = lower(btrim(new.email));
  insert into public.profiles (id, email, display_name, first_name, last_name, role, master_key_access)
  values (
    new.id, lower(btrim(new.email)),
    coalesce(nullif(btrim(concat_ws(' ', invited.first_name, invited.last_name)), ''), nullif(new.raw_user_meta_data ->> 'full_name', '')),
    invited.first_name, invited.last_name,
    'member', coalesce(invited.master_key_access, 'none')
  );
  return new;
end;
$$;

-- 3. Whether the signed-in user is an admin account: lets the proxy send them to /admin instead of the workspace.
--    Says nothing about anyone else.
create or replace function public.is_admin_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.status <> 'disabled');
$$;
revoke all on function public.is_admin_account() from public, anon;
grant execute on function public.is_admin_account() to authenticated, service_role;
