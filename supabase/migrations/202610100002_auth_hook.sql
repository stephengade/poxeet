-- Optional redundant signup gate. The auth.users trigger in the foundation migration
-- remains the enforcing boundary if the Before User Created hook is not configured.
create or replace function public.before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare user_email text;
begin
  user_email := lower(btrim(event -> 'user' ->> 'email'));
  if user_email is null or not exists (select 1 from public.allowlist a where a.email = user_email) then
    raise exception 'This is a private app. Request an invite to continue.' using errcode = '42501';
  end if;
  return event;
end;
$$;
revoke all on function public.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
