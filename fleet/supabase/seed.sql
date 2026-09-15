-- Development seed: 3 vehicles, 3 drivers, schedules, a few payments and events.
-- Run with: psql "$DATABASE_URL" -f supabase/seed.sql   (or supabase db reset)
-- Owner account: create a user in Supabase Auth, then:
--   update public.profiles set role = 'owner' where id = '<auth user id>';

insert into public.vehicles (id, plate, model, in_service_from, odometer_km) values
  ('11111111-1111-1111-1111-111111111111', 'LD-01-01-AA', 'Suzuki S-Presso', '2026-03-01', 18500),
  ('22222222-2222-2222-2222-222222222222', 'LD-02-02-BB', 'Suzuki S-Presso', '2026-05-15', 12200),
  ('33333333-3333-3333-3333-333333333333', 'LD-03-03-CC', 'Suzuki S-Presso', '2026-07-01', 6100)
on conflict (id) do nothing;

insert into public.drivers (id, full_name, phone_e164) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'João Kiala',    '+244923000001'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Manuel Sebastião', '+244923000002'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Pedro Domingos', '+244923000003')
on conflict (id) do nothing;

insert into public.rent_schedule (driver_id, vehicle_id, weekly_rent_aoa, valid_from) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 105000, '2026-03-02'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 105000, '2026-05-18'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 105000, '2026-07-06')
on conflict do nothing;

-- Last four full weeks of payments relative to today (Luanda).
insert into public.rent_payments (driver_id, week_start, amount_aoa, paid_at, method)
select d.id, w::date, x.amount, (w::date + 6)::timestamp at time zone 'Africa/Luanda', 'transfer'
from generate_series(public.week_start_of(public.luanda_today()) - 28, public.week_start_of(public.luanda_today()) - 7, interval '7 days') w
cross join public.drivers d
cross join lateral (
  select case
    when d.full_name = 'João Kiala' then 105000
    when d.full_name = 'Manuel Sebastião' then 70000
    else case when extract(week from w) % 2 = 0 then 105000 else 0 end
  end as amount
) x
where x.amount > 0;

insert into public.maintenance_events (vehicle_id, event_date, category, odometer_km, total_aoa, vendor, notes) values
  ('11111111-1111-1111-1111-111111111111', public.luanda_today() - 40, 'oil_service', 15000, 45000, 'Auto Serviço Talatona', 'Óleo 5W30 + filtro'),
  ('11111111-1111-1111-1111-111111111111', public.luanda_today() - 12, 'fuel',        18200, 30000, 'Sonangol', null),
  ('22222222-2222-2222-2222-222222222222', public.luanda_today() - 20, 'brakes',      11800, 85000, 'Oficina Central', 'Pastilhas dianteiras'),
  ('33333333-3333-3333-3333-333333333333', public.luanda_today() - 5,  'wash',        6100,  5000,  null, null);

insert into public.vehicle_downtime (vehicle_id, from_date, to_date, reason) values
  ('22222222-2222-2222-2222-222222222222', public.luanda_today() - 21, public.luanda_today() - 19, 'Travões na oficina');

insert into public.cash_positions (as_of, cash_aoa, note) values (public.luanda_today(), 1500000, 'Saldo inicial');
