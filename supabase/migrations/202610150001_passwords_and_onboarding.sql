-- Onboarding progress (D-017). The password helpers first written here were dropped before release;
-- 202610150002 removes them from any database that already ran the earlier version of this file.

-- Set when the member finishes the first-run flow. Members may set it themselves.
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;

-- Accounts created before this migration have already seen the old setup page.
update public.profiles set onboarding_completed_at = created_at where onboarding_completed_at is null;
