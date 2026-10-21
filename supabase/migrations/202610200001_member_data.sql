-- Settings → Notifications and Settings → Your data (D-030).

-- 1. Which optional emails a member wants. Failure emails have no column: they're always sent. Members change their
--    own through profiles_update_own; protect_profile_admin_fields leaves these alone.
alter table public.profiles
  add column email_linkedin_expiring boolean not null default true,
  add column email_empty_week boolean not null default true,
  add column email_drafts_ready boolean not null default false,
  add column email_weekly_summary boolean not null default false;

-- 2. Deletes a member's data and keeps their account, in one transaction. Removes their scheduled posts (drafts,
--    approved and the record of sent ones; posts already on LinkedIn stay there), calendars, voice profiles and the
--    analysis status, imported posts and the LinkedIn connection, and empties the brief. Keeps the profile and its
--    settings, their own AI key, credits and usage records, and the notification log (so emails don't repeat).
--    Returns how many rows went from each table. Service role only: the app checks who is asking first.
create or replace function public.delete_member_data(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  counts jsonb := '{}'::jsonb;
  n integer;
begin
  perform 1 from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'No profile for this user.' using errcode = '23503';
  end if;
  delete from public.scheduled_posts where user_id = p_user;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('scheduled_posts', n);
  delete from public.calendars where user_id = p_user;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('calendars', n);
  delete from public.voice_profiles where user_id = p_user;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('voice_profiles', n);
  delete from public.voice_jobs where user_id = p_user;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('voice_jobs', n);
  delete from public.imported_posts where user_id = p_user;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('imported_posts', n);
  delete from public.linkedin_connections where user_id = p_user;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('linkedin_connections', n);
  update public.profiles set brief = '{}'::jsonb where id = p_user;
  return counts;
end;
$$;
revoke all on function public.delete_member_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_member_data(uuid) to service_role;
