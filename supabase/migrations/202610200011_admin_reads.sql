-- The admin pages (PRD ADM-1, D-031): read-only summaries for the operator. Counts and settings only, never a
-- member's posts, voice, brief, tokens or keys. Server only: the app checks profiles.role before calling them.

-- 1. One row per member: who they are, their admin-set fields, how their AI is paid for, and usage counts.
--    used_today counts instance-key calls since midnight UTC, the same window resolveAiAccess caps.
create or replace function public.admin_members()
returns table (
  id uuid, email text, first_name text, last_name text, display_name text, role text, account_status text,
  master_key_access text, daily_generation_cap integer, created_at timestamptz, has_own_key boolean, credits integer,
  used_today integer, calls_7d integer, last_job_at timestamptz, published_30d integer
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.first_name, p.last_name, p.display_name, p.role, p.account_status, p.master_key_access,
    p.daily_generation_cap, p.created_at,
    exists (select 1 from public.user_api_keys k where k.user_id = p.id),
    public.credit_balance(p.id),
    (select count(*) from public.generation_usage u
      where u.user_id = p.id and u.used_master_key and u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::integer,
    (select count(*) from public.generation_usage u where u.user_id = p.id and u.created_at >= now() - interval '7 days')::integer,
    (select max(u.created_at) from public.generation_usage u where u.user_id = p.id),
    (select count(*) from public.scheduled_posts s
      where s.user_id = p.id and s.status = 'posted' and s.posted_at >= now() - interval '30 days')::integer
  from public.profiles p
  order by p.created_at;
$$;

-- 2. AI calls on the instance key per UTC day, for the last p_days days (today included), zero days kept.
create or replace function public.admin_instance_calls(p_days integer default 14)
returns table (day date, calls integer)
language sql stable security definer set search_path = '' as $$
  select d::date, (select count(*) from public.generation_usage u
    where u.used_master_key and (u.created_at at time zone 'utc')::date = d::date)::integer
  from generate_series(((now() at time zone 'utc')::date - (greatest(1, least(p_days, 90)) - 1))::timestamp,
    (now() at time zone 'utc')::date::timestamp, interval '1 day') d
  order by 1;
$$;

-- 3. Credits spent on AI and credits granted free since p_since, for the earnings page and the overview.
create or replace function public.admin_credit_totals(p_since timestamptz)
returns table (used integer, granted integer)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(-sum(l.delta) filter (where l.kind = 'usage'), 0)::integer,
    coalesce(sum(l.delta) filter (where l.kind = 'grant'), 0)::integer
  from public.credit_ledger l
  where l.created_at >= p_since;
$$;

revoke all on function public.admin_members(), public.admin_instance_calls(integer), public.admin_credit_totals(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_members(), public.admin_instance_calls(integer), public.admin_credit_totals(timestamptz)
  to service_role;

-- 4. Who did what: the audit log is read newest first, by actor and by target.
create index if not exists admin_audit_logs_created_at on public.admin_audit_logs (created_at desc);
