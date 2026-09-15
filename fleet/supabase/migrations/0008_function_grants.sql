-- 0008 Function grants: Postgres grants EXECUTE to PUBLIC by default; revoke that and grant explicitly.
revoke execute on function public.is_staff() from public;
revoke execute on function public.current_user_role() from public;
revoke execute on function public.current_driver_id() from public;
revoke execute on function public.generate_rent_alerts(date) from public;
revoke execute on function public.handle_new_user() from public;

grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_driver_id() to authenticated, service_role;
grant execute on function public.generate_rent_alerts(date) to authenticated, service_role;
-- the signup trigger fires as Supabase's auth admin role
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

-- future functions: no automatic PUBLIC execute
alter default privileges in schema public revoke execute on functions from public;
