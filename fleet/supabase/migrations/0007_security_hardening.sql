-- 0007 Security hardening (from Supabase advisor): invoker-rights views, pinned search_path, tighter grants.

-- Views must run with the caller's rights so RLS applies (Supabase defaults to definer semantics).
alter view public.vehicle_month_category_costs set (security_invoker = on);
alter view public.vehicle_last_events set (security_invoker = on);
alter view public.driver_incidents set (security_invoker = on);

-- Pin search_path on the remaining functions.
alter function public.luanda_today() set search_path = public;
alter function public.week_start_of(date) set search_path = public;
alter function public.bump_vehicle_odometer() set search_path = public;

-- Trigger function is never called through the API.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- Helper functions only describe the caller; anon has nothing to learn from them.
revoke execute on function public.is_staff() from anon;
revoke execute on function public.current_user_role() from anon;
revoke execute on function public.current_driver_id() from anon;

-- Alert generation: only staff (app) or the service role (cron) may call it.
revoke execute on function public.generate_rent_alerts(date) from anon;
create or replace function public.generate_rent_alerts(p_week_start date default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_week date := coalesce(p_week_start, week_start_of(luanda_today()) - 7);
  n int;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into rent_alerts (driver_id, vehicle_id, week_start, status, expected_aoa, paid_aoa, outstanding_aoa)
  select driver_id, vehicle_id, week_start, status, expected_aoa, paid_aoa, outstanding_aoa
  from week_status(v_week)
  where status in ('PARTIAL', 'MISSED')
  on conflict (driver_id, week_start) do update
    set status = excluded.status,
        paid_aoa = excluded.paid_aoa,
        outstanding_aoa = excluded.outstanding_aoa,
        updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
