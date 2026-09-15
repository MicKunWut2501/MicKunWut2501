-- RLS: drivers see only their own rows; staff see everything. Runs in one rolled-back transaction.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test'),
  ('00000000-0000-0000-0000-00000000000b', 'driver-b@test'),
  ('00000000-0000-0000-0000-00000000000c', 'driver-c@test');
insert into public.vehicles (id, plate, in_service_from) values
  ('11111111-1111-1111-1111-111111111111', 'R-1', '2026-01-01'),
  ('22222222-2222-2222-2222-222222222222', 'R-2', '2026-01-01');
insert into public.drivers (id, full_name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'C');
update public.profiles set role = 'owner' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set driver_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set driver_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' where id = '00000000-0000-0000-0000-00000000000c';
insert into public.rent_schedule (driver_id, vehicle_id, weekly_rent_aoa, valid_from) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 70000, '2026-01-05'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 70000, '2026-01-05');
insert into public.rent_payments (driver_id, week_start, amount_aoa) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-08-03', 70000),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-08-03', 30000);

-- driver B
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare n int; r record;
begin
  select count(*) into n from public.rent_payments;
  if n <> 1 then raise exception 'driver should see 1 payment, saw %', n; end if;
  select count(*) into n from public.rent_payments where driver_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if n <> 0 then raise exception 'driver saw another driver''s payment'; end if;
  select count(*) into n from public.vehicles;
  if n <> 1 then raise exception 'driver should see only own vehicle, saw %', n; end if;
  select count(*) into n from public.rent_alerts;
  if n <> 0 then raise exception 'driver must not see alerts'; end if;
  -- week_status runs with invoker rights, so it is filtered by RLS too
  select count(*) into n from public.week_status('2026-08-03');
  if n <> 1 then raise exception 'driver week_status should be filtered, saw %', n; end if;
  begin
    insert into public.rent_payments (driver_id, week_start, amount_aoa) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-08-10', 1000);
    raise exception 'driver must not insert payments';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.fleet_targets set net_per_car_month_aoa = 1;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'driver must not update targets'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

-- owner
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare n int;
begin
  select count(*) into n from public.rent_payments;
  if n <> 2 then raise exception 'owner should see 2 payments, saw %', n; end if;
  select count(*) into n from public.week_status('2026-08-03');
  if n <> 2 then raise exception 'owner week_status should have 2 rows, saw %', n; end if;
  insert into public.rent_payments (driver_id, week_start, amount_aoa, recorded_by) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-08-03', 40000, auth.uid());
  update public.fleet_targets set net_per_car_month_aoa = 360000 where id = 1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'owner must be able to update targets'; end if;
end $$;

reset role;
rollback;
