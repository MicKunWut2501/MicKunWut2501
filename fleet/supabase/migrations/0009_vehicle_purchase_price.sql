-- 0009 Purchase price per vehicle, import provenance columns, English labels for seeded rules.
alter table public.vehicles add column if not exists purchase_price_aoa numeric(14,2) check (purchase_price_aoa is null or purchase_price_aoa >= 0);
alter table public.rent_payments add column if not exists source text;
alter table public.maintenance_events add column if not exists source text;
comment on column public.rent_payments.source is 'null = entered in app; e.g. cashflow_xlsx for imported rows';
comment on column public.maintenance_events.source is 'null = entered in app; e.g. cashflow_xlsx for imported rows';

update public.maintenance_rules set label = 'Oil and filter change' where category = 'oil_service';
update public.maintenance_rules set label = 'Brake service'         where category = 'brakes';
update public.maintenance_rules set label = 'Tyres'                 where category = 'tyres';
update public.maintenance_rules set label = 'Insurance'             where category = 'insurance';
update public.maintenance_rules set label = 'Licensing / inspection' where category = 'licensing';
