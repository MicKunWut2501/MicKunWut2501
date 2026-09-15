-- 0004 Planning model: fleet targets, cash positions, monthly per-vehicle facts.

-- Single-row settings table (id is always 1). Edited by the owner in /definicoes.
create table public.fleet_targets (
  id                              int primary key default 1 check (id = 1),
  net_per_car_month_aoa           numeric(14,2) not null default 351000,
  free_cash_per_car_month_aoa     numeric(14,2) not null default 147500,
  -- fixed reserve per car per month in the base year; seeded so net - reserve = free cash
  reserve_rate_aoa_month          numeric(14,2) not null default 203500,
  inflation_rate_yearly           numeric(6,4)  not null default 0.20,   -- 0.20 = 20 % / year
  reserve_base_year               int           not null default 2026,
  car4_purchase_date              date          not null default '2026-12-01',
  car4_private_injection_aoa      numeric(14,2) not null default 12300000,
  passive_income_goal_aoa_month   numeric(14,2) not null default 4000000,
  fleet_size_target_2026          int           not null default 5,
  updated_at                      timestamptz   not null default now(),
  updated_by                      uuid references auth.users (id)
);
insert into public.fleet_targets (id) values (1);

-- Cash on hand snapshots; the dashboard uses the latest row.
create table public.cash_positions (
  id           uuid primary key default gen_random_uuid(),
  as_of        date not null default (now() at time zone 'Africa/Luanda')::date,
  cash_aoa     numeric(14,2) not null check (cash_aoa >= 0),
  note         text,
  recorded_by  uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index cash_positions_as_of_idx on public.cash_positions (as_of desc, created_at desc);

-- ---------------------------------------------------------------------------
-- vehicle_month_facts: raw monthly actuals per vehicle. All model maths (targets, reserve,
-- free cash, pro-rating) happen in src/lib/model so they can be unit-tested; this function
-- only aggregates.
--   active_days      = days of the month the vehicle was in service (in_service_from..in_service_to)
--   downtime_days    = of those, days covered by vehicle_downtime
--   rent_expected/paid are attributed to the month of the rent week's Monday
--   expenses_aoa     = sum of maintenance_events.total_aoa with event_date in the month
-- ---------------------------------------------------------------------------
create or replace function public.vehicle_month_facts(p_from date, p_to date, p_as_of timestamptz default now())
returns table (
  vehicle_id         uuid,
  plate              text,
  month              date,
  days_in_month      int,
  active_days        int,
  downtime_days      int,
  rent_expected_aoa  numeric,
  rent_paid_aoa      numeric,
  expenses_aoa       numeric
)
language sql stable
set search_path = public
as $$
  with months as (
    select m::date as month,
           (m + interval '1 month' - interval '1 day')::date as month_end
    from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') as m
  ),
  vm as (
    select v.id as vehicle_id, v.plate, m.month, m.month_end,
           extract(day from m.month_end)::int as days_in_month,
           greatest(m.month, v.in_service_from) as active_from,
           least(m.month_end, coalesce(v.in_service_to, m.month_end)) as active_to
    from vehicles v
    cross join months m
    where v.in_service_from <= m.month_end
      and (v.in_service_to is null or v.in_service_to >= m.month)
  ),
  active as (
    select vm.vehicle_id, vm.month,
           greatest((vm.active_to - vm.active_from) + 1, 0)::int as active_days
    from vm
  ),
  downtime as (
    select vm.vehicle_id, vm.month, count(distinct d)::int as downtime_days
    from vm
    join vehicle_downtime vd on vd.vehicle_id = vm.vehicle_id
      and vd.from_date <= vm.active_to and vd.to_date >= vm.active_from
    cross join lateral generate_series(greatest(vd.from_date, vm.active_from), least(vd.to_date, vm.active_to), interval '1 day') d
    group by vm.vehicle_id, vm.month
  ),
  weeks as (
    select ws.vehicle_id, date_trunc('month', ws.week_start)::date as month,
           sum(ws.expected_aoa) as rent_expected_aoa, sum(ws.paid_aoa) as rent_paid_aoa
    from week_status_range(date_trunc('month', p_from)::date, (date_trunc('month', p_to) + interval '1 month' - interval '1 day')::date, p_as_of) ws
    group by ws.vehicle_id, date_trunc('month', ws.week_start)
  ),
  exp as (
    select vehicle_id, date_trunc('month', event_date)::date as month, sum(total_aoa) as expenses_aoa
    from maintenance_events
    group by vehicle_id, date_trunc('month', event_date)
  )
  select
    vm.vehicle_id, vm.plate, vm.month, vm.days_in_month,
    a.active_days,
    coalesce(dt.downtime_days, 0),
    coalesce(w.rent_expected_aoa, 0),
    coalesce(w.rent_paid_aoa, 0),
    coalesce(e.expenses_aoa, 0)
  from vm
  join active a on a.vehicle_id = vm.vehicle_id and a.month = vm.month
  left join downtime dt on dt.vehicle_id = vm.vehicle_id and dt.month = vm.month
  left join weeks w on w.vehicle_id = vm.vehicle_id and w.month = vm.month
  left join exp e on e.vehicle_id = vm.vehicle_id and e.month = vm.month
  order by vm.month, vm.plate
$$;

alter table public.fleet_targets  enable row level security;
alter table public.cash_positions enable row level security;

create policy fleet_targets_read  on public.fleet_targets for select using (auth.uid() is not null);
create policy fleet_targets_owner on public.fleet_targets for update using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');

create policy cash_positions_staff on public.cash_positions for all using (public.is_staff()) with check (public.is_staff());
