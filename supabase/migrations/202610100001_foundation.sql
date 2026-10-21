create extension if not exists pgcrypto with schema extensions;

create table public.allowlist (
  email text primary key,
  role text not null default 'member' check (role in ('member', 'admin')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint allowlist_email_normalized check (email = lower(btrim(email)))
);
create index allowlist_invited_by on public.allowlist (invited_by);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  timezone text not null default 'UTC',
  posting_slots jsonb not null default '[]'::jsonb,
  brief jsonb not null default '{}'::jsonb,
  use_shared_key boolean not null default false,
  daily_generation_cap integer not null default 20 check (daily_generation_cap > 0),
  paused boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.invite_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'new' check (status in ('new', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint invite_requests_email_normalized check (email = lower(btrim(email)))
);

create or replace function public.enforce_invite_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or not exists (
    select 1 from public.allowlist a where a.email = lower(btrim(new.email))
  ) then
    raise exception 'This is a private app. Request an invite to continue.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_invite_allowlist_before_signup on auth.users;
create trigger enforce_invite_allowlist_before_signup before insert on auth.users
  for each row execute function public.enforce_invite_allowlist();

create or replace function public.create_profile_for_allowlisted_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare invited_role text;
begin
  select a.role into invited_role from public.allowlist a where a.email = lower(btrim(new.email));
  if invited_role is null then
    raise exception 'This is a private app. Request an invite to continue.' using errcode = '42501';
  end if;
  insert into public.profiles (id, email, display_name, role)
  values (new.id, lower(btrim(new.email)), nullif(new.raw_user_meta_data ->> 'full_name', ''), invited_role);
  return new;
end;
$$;
drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup after insert on auth.users
  for each row execute function public.create_profile_for_allowlisted_user();

create or replace function public.is_allowlisted_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.allowlist a on a.email = p.email
    where p.id = (select auth.uid())
  );
$$;
revoke all on function public.is_allowlisted_user() from public, anon;
grant execute on function public.is_allowlisted_user() to authenticated, service_role;

create or replace function public.protect_profile_admin_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
    new.role is distinct from old.role or new.use_shared_key is distinct from old.use_shared_key or
    new.daily_generation_cap is distinct from old.daily_generation_cap or
    new.email is distinct from old.email or new.id is distinct from old.id
  ) then
    raise exception 'These profile fields can only be changed by an administrator.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_profile_admin_fields_before_update before update on public.profiles
  for each row execute function public.protect_profile_admin_fields();

create table public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  version integer not null check (version > 0),
  profile jsonb not null check (jsonb_typeof(profile) = 'object' and profile ? 'schema_version'),
  origin text not null check (origin in ('generated', 'user_edited', 'restored')),
  is_active boolean not null default false,
  source_post_count integer not null default 0 check (source_post_count >= 0),
  model text,
  created_at timestamptz not null default now(),
  unique (user_id, version), unique (id, user_id)
);
create unique index one_active_voice_per_user on public.voice_profiles (user_id) where is_active;
create index voice_profiles_profile_gin on public.voice_profiles using gin (profile jsonb_path_ops);

create table public.user_api_keys (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ciphertext bytea not null, iv bytea not null, tag bytea not null,
  key_version integer not null default 1, last4 text not null check (char_length(last4) <= 4),
  validated_at timestamptz
);
create table public.linkedin_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  person_urn text not null, display_name text, scopes text[] not null default '{}',
  ciphertext bytea not null, iv bytea not null, tag bytea not null,
  key_version integer not null default 1, expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'needs_reconsent')),
  connected_at timestamptz not null default now()
);

create table public.imported_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('linkedin_export', 'paste')),
  text text not null, text_hash text not null, posted_at timestamptz, url text,
  fts tsvector generated always as (to_tsvector('simple', text)) stored,
  created_at timestamptz not null default now(), unique (user_id, text_hash)
);
create index imported_posts_fts on public.imported_posts using gin (fts);
create index imported_posts_user_posted_at on public.imported_posts (user_id, posted_at desc);

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null, days integer not null check (days between 7 and 120),
  posts_per_week integer not null check (posts_per_week between 1 and 14),
  pillars jsonb not null default '[]'::jsonb,
  voice_profile_id uuid references public.voice_profiles(id) on delete set null,
  created_at timestamptz not null default now(), unique (id, user_id)
);
create index calendars_user_created_at on public.calendars (user_id, created_at desc);
create index calendars_voice_profile_id on public.calendars (voice_profile_id);

create or replace function public.validate_calendar_voice_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.voice_profile_id is not null and not exists (
    select 1 from public.voice_profiles v where v.id = new.voice_profile_id and v.user_id = new.user_id
  ) then
    raise exception 'A calendar can only use its owner’s voice profile.' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger validate_calendar_voice_owner_before_write before insert or update on public.calendars
  for each row execute function public.validate_calendar_voice_owner();

create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  calendar_id uuid, channel text not null default 'linkedin' check (channel in ('linkedin')),
  content text not null check (char_length(content) <= 3000), scheduled_at timestamptz not null,
  pillar text, post_type text, topic_angle text, rationale text, flags jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'posting', 'posted', 'failed', 'skipped', 'missed', 'needs_check')),
  attempts integer not null default 0 check (attempts between 0 and 3), last_error text,
  claimed_at timestamptz, approved_at timestamptz, posted_at timestamptz,
  linkedin_post_urn text, posted_via text check (posted_via in ('api', 'manual')),
  created_at timestamptz not null default now(),
  foreign key (calendar_id) references public.calendars(id) on delete set null
);
create index scheduled_posts_user_scheduled_at on public.scheduled_posts (user_id, scheduled_at);
create index scheduled_posts_calendar_id on public.scheduled_posts (calendar_id);
create index scheduled_posts_due on public.scheduled_posts (scheduled_at) where status = 'approved';

create or replace function public.validate_scheduled_post_calendar_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.calendar_id is not null and not exists (
    select 1 from public.calendars c where c.id = new.calendar_id and c.user_id = new.user_id
  ) then
    raise exception 'A scheduled post can only belong to its owner’s calendar.' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger validate_scheduled_post_calendar_owner_before_write before insert or update on public.scheduled_posts
  for each row execute function public.validate_scheduled_post_calendar_owner();

create or replace function public.protect_scheduled_post_backend_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated' then
    if new.status not in ('draft', 'approved', 'skipped') or old.status not in ('draft', 'approved', 'skipped') then
      raise exception 'This post is already being sent or is read-only.' using errcode = '42501';
    end if;
    if new.linkedin_post_urn is distinct from old.linkedin_post_urn or
       new.posted_at is distinct from old.posted_at or new.posted_via is distinct from old.posted_via or
       new.attempts is distinct from old.attempts or new.claimed_at is distinct from old.claimed_at or
       new.last_error is distinct from old.last_error then
      raise exception 'Publishing state is server-managed.' using errcode = '42501';
    end if;
    if new.content is distinct from old.content then
      if old.status not in ('draft', 'approved') then
        raise exception 'Only draft or approved posts can be edited.' using errcode = '42501';
      end if;
      new.status := 'draft'; new.approved_at := null;
    end if;
    if new.status = 'approved' and old.status is distinct from 'approved' then
      new.approved_at := now();
    elsif new.status <> 'approved' then
      new.approved_at := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_scheduled_post_state_before_update before update on public.scheduled_posts
  for each row execute function public.protect_scheduled_post_backend_state();

create table public.generation_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job text not null, model text not null, input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0), used_shared_key boolean not null default false,
  created_at timestamptz not null default now()
);
create index generation_usage_user_created_at on public.generation_usage (user_id, created_at desc);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, dedupe_key text not null, sent_at timestamptz not null default now(), unique (user_id, kind, dedupe_key)
);
create table public.admin_audit_logs (
  id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null,
  action text not null, target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index admin_audit_logs_actor_created_at on public.admin_audit_logs (actor_id, created_at desc);
create index admin_audit_logs_target_created_at on public.admin_audit_logs (target_user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.voice_profiles enable row level security;
alter table public.user_api_keys enable row level security;
alter table public.linkedin_connections enable row level security;
alter table public.imported_posts enable row level security;
alter table public.calendars enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.generation_usage enable row level security;
alter table public.notifications enable row level security;
alter table public.allowlist enable row level security;
alter table public.invite_requests enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_allowlisted_user()))
  with check (id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy voice_profiles_select_own on public.voice_profiles for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy voice_profiles_insert_own on public.voice_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy voice_profiles_update_own on public.voice_profiles for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowlisted_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy voice_profiles_delete_own on public.voice_profiles for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy imported_posts_own on public.imported_posts for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowlisted_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy calendars_own on public.calendars for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowlisted_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy scheduled_posts_own on public.scheduled_posts for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowlisted_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy generation_usage_read_own on public.generation_usage for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));
create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowlisted_user()));

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.voice_profiles, public.imported_posts, public.calendars, public.scheduled_posts to authenticated;
grant select on public.generation_usage, public.notifications to authenticated;
revoke all on public.allowlist, public.invite_requests, public.user_api_keys,
  public.linkedin_connections, public.admin_audit_logs from anon, authenticated;
