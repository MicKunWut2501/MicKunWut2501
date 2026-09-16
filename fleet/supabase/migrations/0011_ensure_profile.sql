-- 0011 Self-healing profiles: a signed-in user without a profile row gets one (role driver) instead of a redirect loop.
-- Note: TRUNCATE ... CASCADE on drivers also truncates profiles (FK). Never truncate drivers; delete rows instead.
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    insert into public.profiles (id, full_name)
    select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
    from auth.users u where u.id = auth.uid()
    returning * into p;
  end if;
  return p;
end $$;
revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated, service_role;
