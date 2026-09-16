-- 0010 EUR view and loan coverage (replaces the "Finanzierung" sheet KPIs).
alter table public.fleet_targets
  add column if not exists fx_aoa_per_eur      numeric(10,2) not null default 1300,
  add column if not exists loan_installment_eur numeric(10,2) not null default 271.40,
  add column if not exists loan_principal_eur   numeric(12,2) not null default 20040.82,
  add column if not exists loan_start_date      date          not null default '2025-08-01',
  add column if not exists loan_months          int           not null default 96;
