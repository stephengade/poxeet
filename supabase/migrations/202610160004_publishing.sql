-- Publishing (PRD section 12, PUB-1 to PUB-4, D-026): who may move a post to which status, claiming due posts
-- exactly once, and the clean-up the daily job runs.

-- 1. Members may only make the moves in the PRD's post state table (section 12). This replaces the foundation
--    migration's protect_scheduled_post_backend_state, which allowed only draft, approved and skipped, and so
--    blocked posting by hand, fixing a failed post and rescheduling a missed one. It keeps its two habits: edited
--    text goes back to draft, and approved_at follows the status. Only the publisher (service role) sends, fails
--    or flags posts, and a post being sent or already sent can't be changed.
create or replace function public.protect_scheduled_post_backend_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() <> 'authenticated' then
    return new;
  end if;
  if old.status in ('posting', 'posted') then
    raise exception 'This post is already being sent or has been sent.' using errcode = '42501';
  end if;
  if new.attempts is distinct from old.attempts or new.claimed_at is distinct from old.claimed_at
     or new.linkedin_post_urn is distinct from old.linkedin_post_urn or new.user_id is distinct from old.user_id
     or (new.last_error is distinct from old.last_error and new.last_error is not null) then
    raise exception 'Publishing state is server-managed.' using errcode = '42501';
  end if;
  if (new.posted_at is distinct from old.posted_at or new.posted_via is distinct from old.posted_via) and new.status <> 'posted' then
    raise exception 'Publishing state is server-managed.' using errcode = '42501';
  end if;
  -- A needs_check post may already be on LinkedIn: it is resolved, never edited or moved.
  if old.status = 'needs_check' and (new.content is distinct from old.content or new.scheduled_at is distinct from old.scheduled_at) then
    raise exception 'Check LinkedIn first: this post may already be out.' using errcode = '42501';
  end if;
  -- Edited text needs approving again.
  if new.content is distinct from old.content then
    new.status := 'draft';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('approved', 'skipped', 'posted')) or
    (old.status = 'approved' and new.status in ('draft', 'skipped', 'posted')) or
    (old.status = 'skipped' and new.status = 'draft') or
    (old.status in ('failed', 'missed') and new.status in ('draft', 'approved', 'skipped', 'posted')) or
    (old.status = 'needs_check' and new.status in ('posted', 'approved', 'skipped'))
  ) then
    raise exception 'A post can''t move from % to %.', old.status, new.status using errcode = '42501';
  end if;
  -- "Posted" by a member means sent by hand, except confirming a needs_check post the publisher did send.
  if new.status = 'posted' and old.status <> 'needs_check' and new.posted_via is distinct from 'manual' then
    raise exception 'Mark posts you sent yourself as posted by hand.' using errcode = '42501';
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := now();
  elsif new.status <> 'approved' then
    new.approved_at := null;
  end if;
  return new;
end;
$$;

-- New posts from members start as a draft or approved, with no publishing state.
create or replace function public.guard_new_post()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (new.status not in ('draft', 'approved') or new.attempts <> 0
     or new.linkedin_post_urn is not null or new.claimed_at is not null or new.posted_at is not null) then
    raise exception 'New posts start as a draft or approved.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_new_post_before_insert before insert on public.scheduled_posts
  for each row execute function public.guard_new_post();

-- 2. Claims up to p_limit due posts for sending, exactly once even when runs overlap (for update skip locked).
--    Only approved posts that are due, of active, unpaused members with an active, unexpired LinkedIn connection,
--    and with sends left (3 at most, PUB-3).
create or replace function public.claim_due_posts(p_limit integer default 10)
returns setof public.scheduled_posts language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select sp.id from public.scheduled_posts sp
    join public.profiles p on p.id = sp.user_id
    join public.linkedin_connections c on c.user_id = sp.user_id
    where sp.status = 'approved' and sp.scheduled_at <= now() and sp.scheduled_at > now() - interval '24 hours'
      and sp.attempts < 3 and sp.channel = 'linkedin'
      and not p.paused and p.account_status = 'active'
      and c.status = 'active' and c.expires_at > now()
    order by sp.scheduled_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of sp skip locked
  )
  update public.scheduled_posts sp set status = 'posting', attempts = sp.attempts + 1, claimed_at = now(), last_error = null
  from due where sp.id = due.id
  returning sp.*;
end;
$$;

-- 3. Clean-up: a send stuck for 10 minutes may or may not have gone out, so it waits for the member to check;
--    approved posts more than 24 hours late are missed and wait for the member to reschedule or skip them.
create or replace function public.release_stuck_posts()
returns integer language plpgsql security definer set search_path = '' as $$
declare moved integer;
begin
  update public.scheduled_posts set status = 'needs_check', last_error = 'The send didn''t finish, so we can''t tell whether it went out.'
  where status = 'posting' and claimed_at < now() - interval '10 minutes';
  get diagnostics moved = row_count;
  return moved;
end;
$$;

create or replace function public.mark_missed_posts()
returns integer language plpgsql security definer set search_path = '' as $$
declare moved integer;
begin
  update public.scheduled_posts set status = 'missed'
  where status = 'approved' and scheduled_at < now() - interval '24 hours';
  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke all on function public.claim_due_posts(integer), public.release_stuck_posts(), public.mark_missed_posts() from public, anon, authenticated;
grant execute on function public.claim_due_posts(integer), public.release_stuck_posts(), public.mark_missed_posts() to service_role;
