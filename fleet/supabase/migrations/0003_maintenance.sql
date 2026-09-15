-- 0003 Receipts -> maintenance & expense log, reminder rules, per-vehicle cost views.

create type public.expense_category as enum (
  'fuel', 'oil_service', 'tyres', 'brakes', 'repair', 'insurance', 'licensing', 'wash', 'fine', 'other'
);

-- One row per uploaded file in the private "receipts" storage bucket (see 0006_storage.sql).
create table public.receipts (
  id                   uuid primary key default gen_random_uuid(),
  vehicle_id           uuid references public.vehicles (id) on delete set null,
  storage_path         text not null unique,
  mime_type            text not null,
  file_size            integer,
  uploaded_by          uuid references auth.users (id),
  uploaded_at          timestamptz not null default now(),
  extraction           jsonb,             -- ReceiptDraft as returned by extractReceipt(), never auto-committed
  extraction_provider  text               -- 'anthropic' | 'none'
);
create index receipts_vehicle_idx on public.receipts (vehicle_id, uploaded_at desc);

-- Every saved event has a vehicle and a category. This table is THE source of truth for
-- vehicle expenses; the dashboard's net-per-car and reserve calculations read from it.
create table public.maintenance_events (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles (id) on delete restrict,
  receipt_id   uuid unique references public.receipts (id) on delete set null,
  event_date   date not null,
  category     public.expense_category not null,
  odometer_km  integer check (odometer_km is null or odometer_km >= 0),
  total_aoa    numeric(14,2) not null check (total_aoa >= 0),
  vendor       text,
  notes        text,
  line_items   jsonb not null default '[]'::jsonb,   -- [{description, qty, unit_price_aoa}]
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index maintenance_events_vehicle_date_idx on public.maintenance_events (vehicle_id, event_date desc);
create index maintenance_events_category_idx on public.maintenance_events (category);

-- Keep vehicles.odometer_km at the highest reading seen.
create or replace function public.bump_vehicle_odometer()
returns trigger language plpgsql as $$
begin
  if new.odometer_km is not null then
    update public.vehicles set odometer_km = greatest(odometer_km, new.odometer_km) where id = new.vehicle_id;
  end if;
  return new;
end $$;
create trigger maintenance_events_bump_odometer
  after insert or update of odometer_km on public.maintenance_events
  for each row execute function public.bump_vehicle_odometer();

-- Reminder rules: "category X is due every N km and/or every N months" (whichever comes first).
create table public.maintenance_rules (
  id            uuid primary key default gen_random_uuid(),
  category      public.expense_category not null unique,
  label         text not null,
  every_km      integer check (every_km is null or every_km > 0),
  every_months  integer check (every_months is null or every_months > 0),
  active        boolean not null default true,
  check (every_km is not null or every_months is not null)
);

insert into public.maintenance_rules (category, label, every_km, every_months) values
  ('oil_service', 'Mudança de óleo e filtro', 5000, 6),
  ('brakes',      'Revisão de travões',       20000, null),
  ('tyres',       'Pneus',                    40000, null),
  ('insurance',   'Seguro',                   null, 12),
  ('licensing',   'Licenciamento / inspecção', null, 12);

-- Monthly cost per vehicle per category (feeds per-vehicle page, fleet comparison and the dashboard).
create or replace view public.vehicle_month_category_costs as
  select
    vehicle_id,
    date_trunc('month', event_date)::date as month,
    category,
    sum(total_aoa)::numeric(14,2) as total_aoa,
    count(*)::int as events
  from public.maintenance_events
  group by vehicle_id, date_trunc('month', event_date), category;

-- Last event per vehicle per category, used by the due/overdue engine.
create or replace view public.vehicle_last_events as
  select distinct on (vehicle_id, category)
    vehicle_id, category, event_date, odometer_km, total_aoa, id as event_id
  from public.maintenance_events
  order by vehicle_id, category, event_date desc, created_at desc;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.receipts           enable row level security;
alter table public.maintenance_events enable row level security;
alter table public.maintenance_rules  enable row level security;

-- any signed-in user may upload a receipt; drivers see their own uploads, staff see all
create policy receipts_read   on public.receipts for select using (public.is_staff() or uploaded_by = auth.uid());
create policy receipts_insert on public.receipts for insert with check (auth.uid() is not null and uploaded_by = auth.uid());
create policy receipts_staff  on public.receipts for update using (public.is_staff()) with check (public.is_staff());
create policy receipts_delete on public.receipts for delete using (public.is_staff());

create policy maintenance_events_read on public.maintenance_events for select using (
  public.is_staff()
  or exists (select 1 from public.rent_schedule rs where rs.vehicle_id = maintenance_events.vehicle_id and rs.driver_id = public.current_driver_id())
);
create policy maintenance_events_write on public.maintenance_events for all using (public.is_staff()) with check (public.is_staff());

create policy maintenance_rules_read  on public.maintenance_rules for select using (auth.uid() is not null);
create policy maintenance_rules_write on public.maintenance_rules for all using (public.is_staff()) with check (public.is_staff());
