-- 0012 BAANOOL GPS: token storage, device mapping per vehicle, position snapshots.
create table public.gps_settings (
  id            int primary key default 1 check (id = 1),
  provider      text not null default 'baanool',
  token         text,
  token_set_at  timestamptz,
  mileage_unit  text not null default 'km' check (mileage_unit in ('km', 'm')),
  last_sync_at  timestamptz,
  last_error    text,
  updated_by    uuid references auth.users (id)
);
insert into public.gps_settings (id) values (1) on conflict do nothing;

alter table public.vehicles
  add column if not exists gps_device_id text unique,
  add column if not exists gps_odometer_offset_km integer not null default 0;

create table public.gps_snapshots (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references public.vehicles (id) on delete cascade,
  device_id      text not null,
  taken_at       timestamptz not null default now(),
  position_at    timestamptz,
  position_text  text,
  lat            double precision,
  lng            double precision,
  speed_kmh      numeric(8,2),
  mileage_km     numeric(12,2),
  online         boolean,
  raw            jsonb
);
create index gps_snapshots_vehicle_idx on public.gps_snapshots (vehicle_id, taken_at desc);

create or replace view public.vehicle_latest_gps with (security_invoker = on) as
  select distinct on (vehicle_id) *
  from public.gps_snapshots
  order by vehicle_id, taken_at desc;

alter table public.gps_settings  enable row level security;
alter table public.gps_snapshots enable row level security;
-- token is readable only by owner/admin; it is never sent to the browser by the app
create policy gps_settings_staff  on public.gps_settings  for all using (public.is_staff()) with check (public.is_staff());
create policy gps_snapshots_staff on public.gps_snapshots for all using (public.is_staff()) with check (public.is_staff());
