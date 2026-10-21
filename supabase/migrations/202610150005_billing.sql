-- Billing (D-022): credits that expire, any-amount packs, refund clawback, per-job usage and stale holds.
-- Builds on the credit tables from 202610140001 without editing it. Used only when BILLING_ENABLED is on.

-- 1. Purchases and grants expire (3 months by default); an 'expiry' entry removes what was left of them.
alter table public.credit_ledger drop constraint credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check
  check (kind in ('purchase', 'grant', 'hold', 'release', 'usage', 'refund', 'adjustment', 'expiry'));
alter table public.credit_ledger add column expires_at timestamptz;
-- An expiry or refund that finds nothing left to take is still recorded once, as a zero entry.
alter table public.credit_ledger drop constraint credit_ledger_delta_check;
alter table public.credit_ledger add constraint credit_ledger_delta_check check (delta <> 0 or kind in ('expiry', 'refund'));
create index credit_ledger_expiring on public.credit_ledger (user_id, expires_at) where expires_at is not null;

-- 2. A pack can be "any amount": price_amount is then the minimum and credits the credits for that minimum,
--    so the member's chosen amount buys credits at the same rate.
alter table public.credit_packs add column custom_amount boolean not null default false;
alter table public.credit_packs add column bonus_percent integer not null default 0 check (bonus_percent between 0 and 100);

-- 3. Refund bookkeeping: what Bachs refunded, and credits that could not be clawed back because they were spent.
alter table public.checkout_sessions add column refunded_amount numeric(12,2) not null default 0 check (refunded_amount >= 0);
alter table public.checkout_sessions add column refund_shortfall integer not null default 0 check (refund_shortfall >= 0);

-- 4. Usage rows name the job they belong to, so one job is recorded once.
alter table public.generation_usage add column job_id text;
alter table public.generation_usage add column provider text;
create unique index generation_usage_job on public.generation_usage (job_id) where job_id is not null;

-- Removes what is left of each lot (purchase or grant) whose expiry has passed. Spending is first-in first-out,
-- so the credits still held are attributed to the lots that expire last: what remains of a lot is the balance
-- minus everything in lots expiring after it, between zero and the lot's own size. Held credits count as spent,
-- so expiry never takes the balance below zero. Returns the credits removed. Caller holds the profile lock.
create or replace function public.expire_credits(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  lot record;
  later integer;
  left_over integer;
  removed integer := 0;
begin
  for lot in
    select l.id, l.delta, l.expires_at from public.credit_ledger l
    where l.user_id = p_user and l.delta > 0 and l.kind in ('purchase', 'grant') and l.expires_at <= now()
      and not exists (select 1 from public.credit_ledger e where e.kind = 'expiry' and e.reference = 'lot:' || l.id)
    order by l.expires_at, l.id
  loop
    select coalesce(sum(l.delta), 0) into later from public.credit_ledger l
    where l.user_id = p_user and l.delta > 0 and l.kind in ('purchase', 'grant')
      and (l.expires_at is null or l.expires_at > lot.expires_at or (l.expires_at = lot.expires_at and l.id > lot.id))
      and not exists (select 1 from public.credit_ledger e where e.kind = 'expiry' and e.reference = 'lot:' || l.id);
    left_over := greatest(0, least(lot.delta, public.credit_balance(p_user) - later));
    insert into public.credit_ledger (user_id, delta, kind, reference, note)
      values (p_user, -left_over, 'expiry', 'lot:' || lot.id, case when left_over > 0 then 'Unused credits expired' else 'Fully used before expiry' end);
    removed := removed + left_over;
  end loop;
  return removed;
end;
$$;

-- The balance after any due expiry. Use this, not credit_balance, wherever a member sees or spends credits.
create or replace function public.current_credits(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles p where p.id = p_user for update;
  perform public.expire_credits(p_user);
  return public.credit_balance(p_user);
end;
$$;

-- reserve_credits now expires due lots first, inside the same profile lock.
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
  perform public.expire_credits(p_user);
  if public.credit_balance(p_user) < p_amount then
    return false;
  end if;
  insert into public.credit_ledger (user_id, delta, kind, reference) values (p_user, -p_amount, 'hold', p_job_id);
  return true;
end;
$$;

-- settle_credits now returns the credits charged (0 on a repeat call), so the caller records it once.
drop function public.settle_credits(text, integer);
create function public.settle_credits(p_job_id text, p_actual integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  held public.credit_ledger%rowtype;
  charged integer;
begin
  select * into held from public.credit_ledger l where l.kind = 'hold' and l.reference = p_job_id;
  if not found then
    raise exception 'No credits were held for this job.' using errcode = '23503';
  end if;
  perform 1 from public.profiles p where p.id = held.user_id for update;
  if exists (select 1 from public.credit_ledger l where l.kind = 'release' and l.reference = p_job_id) then
    return 0;
  end if;
  insert into public.credit_ledger (user_id, delta, kind, reference) values (held.user_id, -held.delta, 'release', p_job_id);
  charged := least(greatest(coalesce(p_actual, 0), 0), -held.delta);
  if charged > 0 then
    insert into public.credit_ledger (user_id, delta, kind, reference) values (held.user_id, -charged, 'usage', p_job_id);
  end if;
  return charged;
end;
$$;

-- Holds left open (a crashed job) are released in full after 30 minutes. Run by the daily job.
create or replace function public.release_stale_holds(p_older_than interval default interval '30 minutes')
returns integer language plpgsql security definer set search_path = '' as $$
declare stale record; released integer := 0;
begin
  for stale in
    select h.reference from public.credit_ledger h
    where h.kind = 'hold' and h.created_at < now() - p_older_than
      and not exists (select 1 from public.credit_ledger r where r.kind = 'release' and r.reference = h.reference)
  loop
    perform public.settle_credits(stale.reference, 0);
    released := released + 1;
  end loop;
  return released;
end;
$$;

-- grant_credits gains an optional expiry and ignores a repeated reference, so a one-time grant (starter credits)
-- can be retried safely. Returns whether it changed the balance.
drop function public.grant_credits(uuid, integer, text, text);
create function public.grant_credits(p_user uuid, p_amount integer, p_reference text, p_note text default null, p_expires_at timestamptz default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare inserted integer;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'A grant must change the balance.' using errcode = '22023';
  end if;
  perform 1 from public.profiles p where p.id = p_user for update;
  if p_amount < 0 then
    perform public.expire_credits(p_user);
    if public.credit_balance(p_user) + p_amount < 0 then
      raise exception 'That would take the balance below zero.' using errcode = '22023';
    end if;
  end if;
  insert into public.credit_ledger (user_id, delta, kind, reference, note, expires_at)
    values (p_user, p_amount, case when p_amount > 0 then 'grant' else 'adjustment' end, p_reference, p_note,
            case when p_amount > 0 then p_expires_at end)
    on conflict (kind, reference) do nothing;
  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- apply_payment: credits a paid checkout once, with an expiry, and only when the paid amount covers the session.
-- Returns true when it added credits, false when the payment was already applied. Raises on an unknown
-- checkout or an underpayment, so the webhook answers with an error and nothing is credited.
drop function public.apply_payment(text, text, text, text);
create function public.apply_payment(p_checkout_id text, p_charge_id text, p_event_id text, p_event_type text,
  p_paid_amount numeric, p_currency text, p_expires_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare session public.checkout_sessions%rowtype;
begin
  select * into session from public.checkout_sessions c where c.bachs_checkout_id = p_checkout_id for update;
  if not found then
    raise exception 'Unknown checkout.' using errcode = '23503';
  end if;
  insert into public.billing_events (id, type) values (p_event_id, p_event_type) on conflict (id) do nothing;
  if session.status <> 'pending' and session.status <> 'expired' then
    update public.billing_events set processed_at = coalesce(processed_at, now()) where id = p_event_id;
    return false;
  end if;
  if upper(p_currency) <> session.currency or p_paid_amount < session.amount then
    raise exception 'The payment does not cover this checkout.' using errcode = '22023';
  end if;
  update public.checkout_sessions set status = 'paid', bachs_charge_id = p_charge_id, paid_at = now() where id = session.id;
  insert into public.credit_ledger (user_id, delta, kind, reference, note, expires_at)
    values (session.user_id, session.credits, 'purchase', p_checkout_id, null, p_expires_at)
    on conflict (kind, reference) do nothing;
  update public.billing_events set processed_at = now() where id = p_event_id;
  return true;
end;
$$;

-- apply_refund: removes the refunded share of a purchase's credits once per refund. The balance is clawed back
-- only down to zero; credits already spent are recorded as the session's refund_shortfall for the admin.
-- Returns the credits removed, or null when this refund was already applied or the charge is unknown.
create or replace function public.apply_refund(p_charge_id text, p_refund_id text, p_event_id text, p_event_type text, p_refunded_amount numeric)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  session public.checkout_sessions%rowtype;
  wanted integer;
  taken integer;
begin
  insert into public.billing_events (id, type) values (p_event_id, p_event_type) on conflict (id) do nothing;
  select * into session from public.checkout_sessions c where c.bachs_charge_id = p_charge_id for update;
  if not found or session.status not in ('paid', 'partially_refunded') or p_refunded_amount is null or p_refunded_amount <= 0
     or exists (select 1 from public.credit_ledger l where l.kind = 'refund' and l.reference = 'refund:' || p_refund_id) then
    update public.billing_events set processed_at = coalesce(processed_at, now()) where id = p_event_id;
    return null;
  end if;
  perform 1 from public.profiles p where p.id = session.user_id for update;
  perform public.expire_credits(session.user_id);
  wanted := least(session.credits, ceil(session.credits * least(p_refunded_amount, session.amount) / session.amount))::integer;
  taken := greatest(0, least(wanted, public.credit_balance(session.user_id)));
  insert into public.credit_ledger (user_id, delta, kind, reference, note)
    values (session.user_id, -taken, 'refund', 'refund:' || p_refund_id,
            case when taken < wanted then format('%s credits already used', wanted - taken) end);
  update public.checkout_sessions set
    refunded_amount = least(amount, refunded_amount + p_refunded_amount),
    refund_shortfall = refund_shortfall + (wanted - taken),
    status = case when refunded_amount + p_refunded_amount >= amount then 'refunded' else 'partially_refunded' end
  where id = session.id;
  update public.billing_events set processed_at = now() where id = p_event_id;
  return taken;
end;
$$;

revoke all on function public.expire_credits(uuid), public.current_credits(uuid), public.reserve_credits(uuid, integer, text),
  public.settle_credits(text, integer), public.release_stale_holds(interval),
  public.grant_credits(uuid, integer, text, text, timestamptz),
  public.apply_payment(text, text, text, text, numeric, text, timestamptz),
  public.apply_refund(text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.expire_credits(uuid), public.current_credits(uuid), public.reserve_credits(uuid, integer, text),
  public.settle_credits(text, integer), public.release_stale_holds(interval),
  public.grant_credits(uuid, integer, text, text, timestamptz),
  public.apply_payment(text, text, text, text, numeric, text, timestamptz),
  public.apply_refund(text, text, text, text, numeric) to service_role;
