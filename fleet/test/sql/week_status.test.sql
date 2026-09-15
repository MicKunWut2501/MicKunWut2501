-- Tests for week_status / week_status_range / generate_rent_alerts. Runs inside one rolled-back transaction.
begin;

insert into public.vehicles (id, plate, in_service_from) values
  ('11111111-1111-1111-1111-111111111111', 'T-1', '2026-01-01'),
  ('22222222-2222-2222-2222-222222222222', 'T-2', '2026-01-01'),
  ('33333333-3333-3333-3333-333333333333', 'T-3', '2026-01-01'),
  ('44444444-4444-4444-4444-444444444444', 'T-4', '2026-01-01');
insert into public.drivers (id, full_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Paid'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Partial'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Missed'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Midweek');

-- week under test: Monday 2026-08-03 .. Sunday 2026-08-09
insert into public.rent_schedule (driver_id, vehicle_id, weekly_rent_aoa, valid_from) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 70000, '2026-01-05'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 70000, '2026-01-05'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 70000, '2026-01-05'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 70000, '2026-08-06'); -- joins Thursday

insert into public.rent_payments (driver_id, week_start, amount_aoa, paid_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-08-03', 30000, '2026-08-04 10:00+01'),   -- multi-payment
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-08-03', 40000, '2026-08-07 10:00+01'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-08-03', 25000, '2026-08-05 10:00+01'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-08-03', 40000, '2026-08-08 10:00+01');

do $$
declare r record; n int;
begin
  -- evaluated after the deadline (Monday 2026-08-10 00:00 Luanda = 2026-08-09 23:00 UTC)
  select count(*) into n from public.week_status('2026-08-03', '2026-08-10 09:00+01');
  if n <> 4 then raise exception 'expected 4 rows, got %', n; end if;

  select * into r from public.week_status('2026-08-03', '2026-08-10 09:00+01') where driver_name = 'Paid';
  if r.status <> 'PAID' or r.paid_aoa <> 70000 or r.outstanding_aoa <> 0 then raise exception 'PAID case wrong: %', r; end if;

  select * into r from public.week_status('2026-08-03', '2026-08-10 09:00+01') where driver_name = 'Partial';
  if r.status <> 'PARTIAL' or r.outstanding_aoa <> 45000 then raise exception 'PARTIAL case wrong: %', r; end if;

  select * into r from public.week_status('2026-08-03', '2026-08-10 09:00+01') where driver_name = 'Missed';
  if r.status <> 'MISSED' or r.outstanding_aoa <> 70000 then raise exception 'MISSED case wrong: %', r; end if;

  -- same driver evaluated mid-week is PENDING, not MISSED
  select * into r from public.week_status('2026-08-03', '2026-08-05 12:00+01') where driver_name = 'Missed';
  if r.status <> 'PENDING' then raise exception 'PENDING case wrong: %', r; end if;

  -- one second before the deadline is still PENDING, at the deadline it is MISSED
  select * into r from public.week_status('2026-08-03', '2026-08-09 22:59:59+00') where driver_name = 'Missed';
  if r.status <> 'PENDING' then raise exception 'deadline boundary (before) wrong: %', r; end if;
  select * into r from public.week_status('2026-08-03', '2026-08-09 23:00:00+00') where driver_name = 'Missed';
  if r.status <> 'MISSED' then raise exception 'deadline boundary (at) wrong: %', r; end if;

  -- joined Thursday: 4 active days -> expected 70000*4/7 = 40000, fully paid
  select * into r from public.week_status('2026-08-03', '2026-08-10 09:00+01') where driver_name = 'Midweek';
  if r.active_days <> 4 or r.expected_aoa <> 40000 or r.status <> 'PAID' then raise exception 'mid-week join wrong: %', r; end if;

  -- driver not yet active the week before is absent
  select count(*) into n from public.week_status('2026-07-27', '2026-08-10 09:00+01') where driver_name = 'Midweek';
  if n <> 0 then raise exception 'mid-week driver should not appear in earlier week'; end if;
end $$;

-- downtime removes expected rent; full-week downtime => EXEMPT
insert into public.vehicle_downtime (vehicle_id, from_date, to_date, reason) values
  ('33333333-3333-3333-3333-333333333333', '2026-08-03', '2026-08-09', 'engine'),
  ('22222222-2222-2222-2222-222222222222', '2026-08-08', '2026-08-09', 'tyres');
do $$
declare r record;
begin
  select * into r from public.week_status('2026-08-03', '2026-08-10 09:00+01') where driver_name = 'Missed';
  if r.status <> 'EXEMPT' or r.expected_aoa <> 0 then raise exception 'EXEMPT case wrong: %', r; end if;
  select * into r from public.week_status('2026-08-03', '2026-08-10 09:00+01') where driver_name = 'Partial';
  if r.active_days <> 5 or r.expected_aoa <> 50000 or r.outstanding_aoa <> 25000 then raise exception 'downtime pro-rating wrong: %', r; end if;
end $$;
delete from public.vehicle_downtime;

-- week_status_range covers both weeks, generate_rent_alerts writes PARTIAL/MISSED only and is idempotent
do $$
declare n int;
begin
  select count(*) into n from public.week_status_range('2026-07-27', '2026-08-09', '2026-08-10 09:00+01');
  if n <> 7 then raise exception 'range should give 3 + 4 rows, got %', n; end if;

  -- generate_rent_alerts uses now(); the test week is in the past relative to any realistic clock
  perform public.generate_rent_alerts('2026-08-03');
  select count(*) into n from public.rent_alerts where week_start = '2026-08-03';
  if n <> 2 then raise exception 'expected 2 alerts, got %', n; end if;
  perform public.generate_rent_alerts('2026-08-03');
  select count(*) into n from public.rent_alerts where week_start = '2026-08-03';
  if n <> 2 then raise exception 'alerts not idempotent, got %', n; end if;
end $$;

-- vehicle_month_facts: pro-rated active days and rent attribution by week_start month
do $$
declare r record;
begin
  update public.vehicles set in_service_from = '2026-08-20' where plate = 'T-4';
  select * into r from public.vehicle_month_facts('2026-08-01', '2026-08-31', '2026-09-01 09:00+01') where plate = 'T-4';
  if r.days_in_month <> 31 or r.active_days <> 12 then raise exception 'active_days wrong: %', r; end if;
  select * into r from public.vehicle_month_facts('2026-08-01', '2026-08-31', '2026-09-01 09:00+01') where plate = 'T-1';
  if r.active_days <> 31 or r.rent_paid_aoa <> 70000 then raise exception 'T-1 facts wrong: %', r; end if;
end $$;

rollback;
