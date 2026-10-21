-- PRD revision 2, section 11: open sign-up with an invite-only switch, admin-controlled master-key access
-- and account status, and the (always created, optionally used) credit tables. Changes the foundation
-- migration without editing it.

-- 1. Instance settings: one row, read by the sign-up trigger. No member access.
create table public.instance_settings (
  id boolean primary key default true check (id),
  signup_mode text not null default 'open' check (signup_mode in ('open', 'invite_only')),
  updated_at timestamptz not null default now()
);
insert into public.instance_settings (id) values (true);
alter table public.instance_settings enable row level security;
revoke all on public.instance_settings from anon, authenticated;

-- 5. The access list can pre-assign master-key access.
alter table public.allowlist
  add column master_key_access text not null default 'none' check (master_key_access in ('none', 'granted'));

-- 2. Sign-up is refused only when the instance is invite-only and the email is not on the access list.
create or replace function public.enforce_invite_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select s.signup_mode from public.instance_settings s where s.id) = 'invite_only' and (
    new.email is null or not exists (select 1 from public.allowlist a where a.email = lower(btrim(new.email)))
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
  if (select s.signup_mode from public.instance_settings s where s.id) = 'invite_only' and (
    user_email is null or not exists (select 1 from public.allowlist a where a.email = user_email)
  ) then
    raise exception 'Sign-up on this instance is by invitation.' using errcode = '42501';
  end if;
  return event;
end;
$$;

-- 4. Admin-controlled access fields on profiles, replacing use_shared_key.
alter table public.profiles
  add column master_key_access text not null default 'none' check (master_key_access in ('none', 'granted')),
  add column account_status text not null default 'active' check (account_status in ('active', 'suspended'));
update public.profiles set master_key_access = 'granted' where use_shared_key;
alter table public.profiles drop column use_shared_key;
alter table public.profiles alter column posting_slots
  set default '[{"day":"mon","time":"09:00"},{"day":"wed","time":"09:00"},{"day":"fri","time":"09:00"}]'::jsonb;

create or replace function public.protect_profile_admin_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
    new.role is distinct from old.role or new.master_key_access is distinct from old.master_key_access or
    new.account_status is distinct from old.account_status or
    new.daily_generation_cap is distinct from old.daily_generation_cap or
    new.email is distinct from old.email or new.id is distinct from old.id
  ) then
    raise exception 'These profile fields can only be changed by an administrator.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 3. Every new auth user gets a profile. The access list, when it has the email, sets role and master-key access.
drop trigger if exists create_profile_after_signup on auth.users;
drop function if exists public.create_profile_for_allowlisted_user();
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare invited public.allowlist%rowtype;
begin
  select * into invited from public.allowlist a where a.email = lower(btrim(new.email));
  insert into public.profiles (id, email, display_name, role, master_key_access)
  values (
    new.id, lower(btrim(new.email)), nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(invited.role, 'member'), coalesce(invited.master_key_access, 'none')
  );
  return new;
end;
$$;
create trigger create_profile_after_signup after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- 6. is_active_member() replaces is_allowlisted_user() in every member policy.
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_status = 'active'
  );
$$;
revoke all on function public.is_active_member() from public, anon;
grant execute on function public.is_active_member() to authenticated, service_role;

drop policy profiles_select_own on public.profiles;
drop policy profiles_update_own on public.profiles;
drop policy voice_profiles_select_own on public.voice_profiles;
drop policy voice_profiles_insert_own on public.voice_profiles;
drop policy voice_profiles_update_own on public.voice_profiles;
drop policy voice_profiles_delete_own on public.voice_profiles;
drop policy imported_posts_own on public.imported_posts;
drop policy calendars_own on public.calendars;
drop policy scheduled_posts_own on public.scheduled_posts;
drop policy generation_usage_read_own on public.generation_usage;
drop policy notifications_read_own on public.notifications;
drop function public.is_allowlisted_user();

-- A suspended member can still read their own profile, so the app can say why access stopped.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_member()))
  with check (id = (select auth.uid()) and (select public.is_active_member()));
create policy voice_profiles_own on public.voice_profiles for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));
create policy imported_posts_own on public.imported_posts for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));
create policy calendars_own on public.calendars for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));
create policy scheduled_posts_own on public.scheduled_posts for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));
create policy generation_usage_read_own on public.generation_usage for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));
create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));

-- 7. Invite requests are gone; sign-up is open or the operator adds emails to the access list.
drop table public.invite_requests;

-- 8. Usage records name the master key and the credits a job cost.
alter table public.generation_usage rename column used_shared_key to used_master_key;
alter table public.generation_usage add column credits_charged integer not null default 0 check (credits_charged >= 0);

-- 9. Billing tables, created always and used only when BILLING_ENABLED is on.
create table public.credit_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  credits integer not null check (credits > 0),
  price_amount numeric(12,2) not null check (price_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  bachs_product_id text not null unique,
  active boolean not null default true,
  sort integer not null default 0
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null check (delta <> 0),
  kind text not null check (kind in ('purchase', 'grant', 'hold', 'release', 'usage', 'refund', 'adjustment')),
  reference text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (kind, reference)
);
create index credit_ledger_user on public.credit_ledger (user_id, created_at desc);

create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pack_id uuid not null references public.credit_packs(id),
  bachs_checkout_id text not null unique,
  bachs_charge_id text unique,
  credits integer not null check (credits > 0),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'refunded', 'partially_refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index checkout_sessions_user on public.checkout_sessions (user_id, created_at desc);
create index checkout_sessions_pack on public.checkout_sessions (pack_id);

create table public.billing_events (
  id text primary key,
  type text not null,
  created_at_provider timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.credit_packs enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.checkout_sessions enable row level security;
alter table public.billing_events enable row level security;

create policy credit_packs_read_active on public.credit_packs for select to authenticated
  using (active and (select public.is_active_member()));
create policy credit_ledger_read_own on public.credit_ledger for select to authenticated
  using (user_id = (select auth.uid()));
create policy checkout_sessions_read_own on public.checkout_sessions for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.credit_packs, public.credit_ledger, public.checkout_sessions, public.billing_events from anon, authenticated;
grant select on public.credit_packs, public.credit_ledger, public.checkout_sessions to authenticated;

-- Credit functions: security definer, callable by the service role only.
create or replace function public.credit_balance(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.delta), 0)::integer from public.credit_ledger l where l.user_id = p_user;
$$;

-- Locking the profile row serializes one member's jobs, so the balance never goes below zero.
create or replace function public.reserve_credits(p_user uuid, p_amount integer, p_job_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'A reservation must be a positive number of credits.' using errcode = '22023';
  end if;
  perform 1 from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'No profile for this user.' using errcode = '23503';
  end if;
  if exists (select 1 from public.credit_ledger l where l.kind = 'hold' and l.reference = p_job_id) then
    return true;
  end if;
  if public.credit_balance(p_user) < p_amount then
    return false;
  end if;
  insert into public.credit_ledger (user_id, delta, kind, reference) values (p_user, -p_amount, 'hold', p_job_id);
  return true;
end;
$$;

-- Releases the hold and charges what was used, never more than was held. Calling it twice changes nothing.
create or replace function public.settle_credits(p_job_id text, p_actual integer)
returns void language plpgsql security definer set search_path = '' as $$
declare held public.credit_ledger%rowtype;
begin
  select * into held from public.credit_ledger l where l.kind = 'hold' and l.reference = p_job_id;
  if not found then
    raise exception 'No credits were held for this job.' using errcode = '23503';
  end if;
  insert into public.credit_ledger (user_id, delta, kind, reference)
    values (held.user_id, -held.delta, 'release', p_job_id) on conflict (kind, reference) do nothing;
  if coalesce(p_actual, 0) > 0 then
    insert into public.credit_ledger (user_id, delta, kind, reference)
      values (held.user_id, -least(p_actual, -held.delta), 'usage', p_job_id) on conflict (kind, reference) do nothing;
  end if;
end;
$$;

create or replace function public.grant_credits(p_user uuid, p_amount integer, p_reference text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'A grant must change the balance.' using errcode = '22023';
  end if;
  insert into public.credit_ledger (user_id, delta, kind, reference, note)
    values (p_user, p_amount, case when p_amount > 0 then 'grant' else 'adjustment' end, p_reference, p_note);
end;
$$;

-- Applies a paid checkout once: the event row, the session status and the purchase entry move together.
create or replace function public.apply_payment(p_checkout_id text, p_charge_id text, p_event_id text, p_event_type text default 'checkout.paid')
returns boolean language plpgsql security definer set search_path = '' as $$
declare session public.checkout_sessions%rowtype;
begin
  insert into public.billing_events (id, type) values (p_event_id, p_event_type) on conflict (id) do nothing;
  select * into session from public.checkout_sessions c where c.bachs_checkout_id = p_checkout_id for update;
  if not found then
    raise exception 'Unknown checkout.' using errcode = '23503';
  end if;
  if session.status = 'paid' then
    update public.billing_events set processed_at = coalesce(processed_at, now()) where id = p_event_id;
    return false;
  end if;
  update public.checkout_sessions set status = 'paid', bachs_charge_id = p_charge_id, paid_at = now() where id = session.id;
  insert into public.credit_ledger (user_id, delta, kind, reference)
    values (session.user_id, session.credits, 'purchase', p_checkout_id) on conflict (kind, reference) do nothing;
  update public.billing_events set processed_at = now() where id = p_event_id;
  return true;
end;
$$;

revoke all on function public.credit_balance(uuid), public.reserve_credits(uuid, integer, text),
  public.settle_credits(text, integer), public.grant_credits(uuid, integer, text, text),
  public.apply_payment(text, text, text, text) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid), public.reserve_credits(uuid, integer, text),
  public.settle_credits(text, integer), public.grant_credits(uuid, integer, text, text),
  public.apply_payment(text, text, text, text) to service_role;

-- 10. claim_due_posts arrives with the publisher (phase 3) and must skip owners whose account_status is not active.
