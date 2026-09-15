-- 0001 Foundation: roles, drivers, vehicles, rent schedule (driver <-> vehicle assignment), downtime.
-- All money columns are numeric(14,2) in AOA and suffixed _aoa. Dates are Luanda-local calendar dates.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.user_role as enum ('owner', 'admin', 'driver');

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table public.drivers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone_e164  text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        public.user_role not null default 'driver',
  driver_id   uuid unique references public.drivers (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  plate            text not null unique,
  model            text not null default 'Suzuki S-Presso',
  in_service_from  date not null,
  in_service_to    date check (in_service_to is null or in_service_to >= in_service_from),
  odometer_km      integer not null default 0 check (odometer_km >= 0),
  created_at       timestamptz not null default now()
);

-- One row = "driver X drives vehicle Y and owes weekly_rent_aoa between valid_from and valid_to".
-- This IS the assignment table; there is deliberately no separate assignments table.
create table public.rent_schedule (
  id               uuid primary key default gen_random_uuid(),
  driver_id        uuid not null references public.drivers (id) on delete restrict,
  vehicle_id       uuid not null references public.vehicles (id) on delete restrict,
  weekly_rent_aoa  numeric(14,2) not null check (weekly_rent_aoa > 0),
  valid_from       date not null,
  valid_to         date check (valid_to is null or valid_to >= valid_from),
  created_at       timestamptz not null default now(),
  -- a driver has at most one schedule at any point in time; a vehicle has at most one driver
  constraint rent_schedule_driver_no_overlap exclude using gist (
    driver_id with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  ),
  constraint rent_schedule_vehicle_no_overlap exclude using gist (
    vehicle_id with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  )
);
create index rent_schedule_driver_idx on public.rent_schedule (driver_id, valid_from);
create index rent_schedule_vehicle_idx on public.rent_schedule (vehicle_id, valid_from);

-- Days a vehicle was off-road: no rent is expected for those days.
create table public.vehicle_downtime (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles (id) on delete cascade,
  from_date   date not null,
  to_date     date not null check (to_date >= from_date),
  reason      text not null,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);
create index vehicle_downtime_vehicle_idx on public.vehicle_downtime (vehicle_id, from_date);

-- ---------------------------------------------------------------------------
-- Time helpers (Luanda = UTC+1, no DST)
-- ---------------------------------------------------------------------------
create or replace function public.luanda_today()
returns date language sql stable as $$
  select (now() at time zone 'Africa/Luanda')::date
$$;

-- Monday of the ISO week containing d.
create or replace function public.week_start_of(d date)
returns date language sql immutable as $$
  select d - (extract(isodow from d)::int - 1)
$$;

-- ---------------------------------------------------------------------------
-- Auth helpers used by RLS. security definer so they can read profiles regardless of RLS.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.current_driver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select driver_id from public.profiles where id = auth.uid()
$$;

-- New auth user -> profile row (role defaults to driver; owner promotes via SQL or settings page).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.drivers          enable row level security;
alter table public.vehicles         enable row level security;
alter table public.rent_schedule    enable row level security;
alter table public.vehicle_downtime enable row level security;

create policy profiles_self_read   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_staff_write on public.profiles for all    using (public.is_staff()) with check (public.is_staff());

create policy drivers_read  on public.drivers for select using (public.is_staff() or id = public.current_driver_id());
create policy drivers_write on public.drivers for all    using (public.is_staff()) with check (public.is_staff());

create policy vehicles_read on public.vehicles for select using (
  public.is_staff()
  or exists (select 1 from public.rent_schedule rs where rs.vehicle_id = vehicles.id and rs.driver_id = public.current_driver_id())
);
create policy vehicles_write on public.vehicles for all using (public.is_staff()) with check (public.is_staff());

create policy rent_schedule_read  on public.rent_schedule for select using (public.is_staff() or driver_id = public.current_driver_id());
create policy rent_schedule_write on public.rent_schedule for all    using (public.is_staff()) with check (public.is_staff());

create policy downtime_read  on public.vehicle_downtime for select using (
  public.is_staff()
  or exists (select 1 from public.rent_schedule rs where rs.vehicle_id = vehicle_downtime.vehicle_id and rs.driver_id = public.current_driver_id())
);
create policy downtime_write on public.vehicle_downtime for all using (public.is_staff()) with check (public.is_staff());

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on functions to authenticated, service_role;
