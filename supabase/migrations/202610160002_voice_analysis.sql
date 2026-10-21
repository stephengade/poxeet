-- Voice analysis (D-024): one status row per member for the running job, and saving a new voice profile version.

-- 1. The latest analysis per member: running, done or failed (with what to tell them). Written by the server only.
create table public.voice_jobs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (status in ('running', 'done', 'failed')),
  -- failed: a short reason the app turns into a message ('no_credits', 'no_access', 'provider', 'invalid', 'error').
  reason text,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.voice_jobs enable row level security;
create policy voice_jobs_read_own on public.voice_jobs for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));
revoke all on public.voice_jobs from anon, authenticated;
grant select on public.voice_jobs to authenticated;

-- 2. Saves a profile as the next version and makes it the only active one, in one transaction (PRD section 9:
--    history is never overwritten). Returns the new version number. Service role only.
create or replace function public.save_voice_profile(p_user uuid, p_profile jsonb, p_origin text, p_post_count integer, p_model text)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  if p_origin not in ('generated', 'user_edited', 'restored') then
    raise exception 'Unknown origin.' using errcode = '22023';
  end if;
  perform 1 from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'No profile for this user.' using errcode = '23503';
  end if;
  select coalesce(max(v.version), 0) + 1 into next_version from public.voice_profiles v where v.user_id = p_user;
  update public.voice_profiles set is_active = false where user_id = p_user and is_active;
  insert into public.voice_profiles (user_id, version, profile, origin, is_active, source_post_count, model)
    values (p_user, next_version, p_profile, p_origin, true, coalesce(p_post_count, 0), p_model);
  return next_version;
end;
$$;
revoke all on function public.save_voice_profile(uuid, jsonb, text, integer, text) from public, anon, authenticated;
grant execute on function public.save_voice_profile(uuid, jsonb, text, integer, text) to service_role;
