-- 0005 Driver scorecard weights + agent run log.

create table public.score_weights (
  id                 int primary key default 1 check (id = 1),
  on_time_pct        numeric(5,2) not null default 40,
  shortfall_pct      numeric(5,2) not null default 25,
  incidents_pct      numeric(5,2) not null default 25,
  downtime_pct       numeric(5,2) not null default 10,
  min_weeks          int not null default 4,      -- below this: "insufficient data"
  window_weeks       int not null default 12,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id),
  check (on_time_pct + shortfall_pct + incidents_pct + downtime_pct = 100)
);
insert into public.score_weights (id) values (1);

-- Every automated agent run (weekly brief, rent alerts, receipt extraction) is logged here.
create table public.agent_runs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                 -- 'rent_alerts' | 'weekly_brief' | 'receipt_extraction'
  status       text not null default 'ok',    -- 'ok' | 'error' | 'skipped'
  model        text,
  input        jsonb,
  output       text,
  tokens_in    int,
  tokens_out   int,
  error        text,
  ran_at       timestamptz not null default now(),
  triggered_by uuid references auth.users (id)
);
create index agent_runs_kind_idx on public.agent_runs (kind, ran_at desc);

-- Maintenance events attributed to the driver who held the vehicle on the event date.
create or replace view public.driver_incidents as
  select
    me.id as event_id, me.vehicle_id, me.event_date, me.category, me.total_aoa, me.notes,
    rs.driver_id
  from public.maintenance_events me
  join public.rent_schedule rs
    on rs.vehicle_id = me.vehicle_id
   and me.event_date >= rs.valid_from
   and (rs.valid_to is null or me.event_date <= rs.valid_to)
  where me.category in ('repair', 'brakes', 'tyres', 'fine');

alter table public.score_weights enable row level security;
alter table public.agent_runs    enable row level security;

create policy score_weights_read  on public.score_weights for select using (public.is_staff());
create policy score_weights_owner on public.score_weights for update using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');
create policy agent_runs_staff    on public.agent_runs for all using (public.is_staff()) with check (public.is_staff());
