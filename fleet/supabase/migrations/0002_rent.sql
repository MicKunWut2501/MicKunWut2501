-- 0002 Rent collection: payments, weekly status, alerts, WhatsApp log.

create type public.payment_method as enum ('transfer', 'cash', 'multicaixa', 'other');
-- PENDING = current week, nothing paid yet, deadline not reached. EXEMPT = nothing expected (full-week downtime).
create type public.rent_status as enum ('PAID', 'PARTIAL', 'MISSED', 'PENDING', 'EXEMPT');

create table public.rent_payments (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null references public.drivers (id) on delete restrict,
  week_start   date not null check (extract(isodow from week_start) = 1),
  amount_aoa   numeric(14,2) not null check (amount_aoa > 0),
  paid_at      timestamptz not null default now(),
  method       public.payment_method not null default 'transfer',
  note         text,
  recorded_by  uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index rent_payments_driver_week_idx on public.rent_payments (driver_id, week_start);
create index rent_payments_week_idx on public.rent_payments (week_start);

create table public.rent_alerts (
  id               uuid primary key default gen_random_uuid(),
  driver_id        uuid not null references public.drivers (id) on delete cascade,
  vehicle_id       uuid references public.vehicles (id) on delete set null,
  week_start       date not null,
  status           public.rent_status not null,
  expected_aoa     numeric(14,2) not null,
  paid_aoa         numeric(14,2) not null,
  outstanding_aoa  numeric(14,2) not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references auth.users (id),
  unique (driver_id, week_start)
);

create table public.whatsapp_messages (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.drivers (id) on delete cascade,
  week_start  date not null,
  phone_e164  text,
  message     text not null,
  sent_by     uuid references auth.users (id),
  sent_at     timestamptz not null default now()
);
create index whatsapp_messages_driver_idx on public.whatsapp_messages (driver_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- week_status: one row per driver with a schedule overlapping the week.
--   expected = weekly_rent * active_days / 7, rounded to whole kwanza.
--   active_days = days in the week covered by a schedule and not covered by vehicle downtime.
--   deadline    = Monday 00:00 Africa/Luanda after the week (i.e. Sunday 23:59:59 Luanda).
--   p_as_of lets tests and the cron job evaluate "MISSED" deterministically.
-- ---------------------------------------------------------------------------
create type public.week_status_row as (
  driver_id        uuid,
  driver_name      text,
  phone_e164       text,
  vehicle_id       uuid,
  plate            text,
  week_start       date,
  active_days      int,
  weekly_rent_aoa  numeric,
  expected_aoa     numeric,
  paid_aoa         numeric,
  outstanding_aoa  numeric,
  status           public.rent_status,
  deadline         timestamptz
);

create or replace function public.week_status(p_week_start date, p_as_of timestamptz default now())
returns setof public.week_status_row
language sql stable
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series(p_week_start, p_week_start + 6, interval '1 day') as d
  ),
  sched_days as (
    select rs.driver_id, rs.vehicle_id, rs.weekly_rent_aoa, rs.valid_from, dy.day
    from rent_schedule rs
    join days dy on dy.day >= rs.valid_from and (rs.valid_to is null or dy.day <= rs.valid_to)
    where not exists (
      select 1 from vehicle_downtime vd
      where vd.vehicle_id = rs.vehicle_id and dy.day between vd.from_date and vd.to_date
    )
  ),
  per_driver as (
    select
      driver_id,
      count(*)::int                                   as active_days,
      round(sum(weekly_rent_aoa / 7.0), 0)            as expected_aoa,
      -- latest schedule in the week decides vehicle + rent shown
      (array_agg(vehicle_id      order by valid_from desc))[1] as vehicle_id,
      (array_agg(weekly_rent_aoa order by valid_from desc))[1] as weekly_rent_aoa
    from sched_days
    group by driver_id
  ),
  paid as (
    select driver_id, sum(amount_aoa) as paid_aoa
    from rent_payments
    where week_start = p_week_start
    group by driver_id
  ),
  joined as (
    select
      pd.driver_id, d.full_name, d.phone_e164, pd.vehicle_id, v.plate,
      pd.active_days, pd.weekly_rent_aoa, pd.expected_aoa,
      coalesce(p.paid_aoa, 0)::numeric as paid_aoa,
      ((p_week_start + 7)::timestamp at time zone 'Africa/Luanda') as deadline
    from per_driver pd
    join drivers d on d.id = pd.driver_id
    join vehicles v on v.id = pd.vehicle_id
    left join paid p on p.driver_id = pd.driver_id
  )
  select
    driver_id, full_name, phone_e164, vehicle_id, plate, p_week_start,
    active_days, weekly_rent_aoa, expected_aoa, paid_aoa,
    greatest(expected_aoa - paid_aoa, 0) as outstanding_aoa,
    case
      when expected_aoa = 0        then 'EXEMPT'::rent_status
      when paid_aoa >= expected_aoa then 'PAID'::rent_status
      when paid_aoa > 0            then 'PARTIAL'::rent_status
      when p_as_of >= deadline     then 'MISSED'::rent_status
      else                              'PENDING'::rent_status
    end as status,
    deadline
  from joined
  order by full_name
$$;

-- All weeks between two Mondays (inclusive). Used by history views and the scorecard.
create or replace function public.week_status_range(p_from date, p_to date, p_as_of timestamptz default now())
returns setof public.week_status_row
language sql stable
set search_path = public
as $$
  select ws.*
  from generate_series(week_start_of(p_from), week_start_of(p_to), interval '7 days') as w
  cross join lateral public.week_status(w::date, p_as_of) as ws
$$;

-- Weekly cron (Monday 08:00 Luanda): write/refresh an alert for every PARTIAL/MISSED driver of last week.
create or replace function public.generate_rent_alerts(p_week_start date default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_week date := coalesce(p_week_start, week_start_of(luanda_today()) - 7);
  n int;
begin
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

-- ---------------------------------------------------------------------------
-- RLS: drivers see only their own payments; owner/admin see everything.
-- ---------------------------------------------------------------------------
alter table public.rent_payments     enable row level security;
alter table public.rent_alerts       enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy rent_payments_read  on public.rent_payments for select using (public.is_staff() or driver_id = public.current_driver_id());
create policy rent_payments_write on public.rent_payments for all    using (public.is_staff()) with check (public.is_staff());

create policy rent_alerts_staff       on public.rent_alerts       for all using (public.is_staff()) with check (public.is_staff());
create policy whatsapp_messages_staff on public.whatsapp_messages for all using (public.is_staff()) with check (public.is_staff());
