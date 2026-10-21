-- Which AI model and provider the shared key runs on is a business secret (D-034). Members could read it from their
-- own generation_usage and voice_profiles rows through the API, so they now read every column except those. The
-- server (service role) still reads them, for the admin's cost estimate. A column added to either table later needs
-- its own grant here before members can read it.
revoke select on public.generation_usage, public.voice_profiles from authenticated;

grant select (id, user_id, job, input_tokens, output_tokens, used_master_key, created_at, credits_charged, job_id)
  on public.generation_usage to authenticated;

grant select (id, user_id, version, profile, origin, is_active, source_post_count, created_at)
  on public.voice_profiles to authenticated;
