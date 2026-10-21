-- Security review 2026-10-20 (docs/security-review-2026-10-20.md). Table grants narrowed to what members use.
-- Supabase gives anon and authenticated every privilege on new public tables (TRUNCATE included, which Row Level
-- Security does not cover), so the member tables relied on RLS alone. Changes no existing migration.

-- 1. Signed-out visitors read and write nothing directly; every policy is for authenticated only.
revoke all on public.profiles, public.voice_profiles, public.imported_posts, public.calendars, public.scheduled_posts,
  public.generation_usage, public.notifications from anon;

-- 2. Members get only the operations their policies are written for. No TRUNCATE, REFERENCES or TRIGGER.
revoke all on public.profiles, public.voice_profiles, public.imported_posts, public.calendars, public.scheduled_posts,
  public.generation_usage, public.notifications from authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.voice_profiles, public.imported_posts, public.scheduled_posts to authenticated;
grant select on public.generation_usage, public.notifications to authenticated;

-- 3. Calendars are written by the server only (startPlan, resumePlan, runCalendar). A member who could write their
--    own row could set plan, weeks_total or status, and the drafter would then run an AI job for every slot in that
--    plan (on the instance key, for members granted it). Members keep reading and deleting their own calendars.
grant select, delete on public.calendars to authenticated;
