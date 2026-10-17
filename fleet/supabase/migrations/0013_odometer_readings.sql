-- 0013 Dashboard odometer readings reported by drivers. Each reading calibrates the BAANOOL tracker
-- (vehicles.gps_odometer_offset_km = reading - tracker mileage at that time); the first reading per car is the
-- starting point for "km driven".
create table public.odometer_readings (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
  read_on      date not null,
  odometer_km  integer not null check (odometer_km >= 0),
  driver_id    uuid references public.drivers (id) on delete set null,
  tracker_km   numeric(12,2),
  tracker_at   timestamptz,
  note         text,
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (vehicle_id, read_on)
);
create index odometer_readings_vehicle_idx on public.odometer_readings (vehicle_id, read_on);

alter table public.odometer_readings enable row level security;
create policy odometer_readings_staff on public.odometer_readings for all using (public.is_staff()) with check (public.is_staff());
