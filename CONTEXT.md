# CONTEXT.md — Frota Luanda (Yango fleet app)

_Last updated 2026-09-15. Read this before touching any feature. The app lives in `fleet/` (Next.js 16, App Router,
TypeScript, Tailwind v4, Supabase). This repository is also the GitHub profile repo; the root `README.md` is the profile._

## 0. History

The warm-up session found no application code in any accessible repository, so the app was built from scratch in this
session with all four planned features (rent collection, model vs reality, receipt → maintenance log, driver scorecard)
plus an operations agent. Everything below describes real code.

## 1. Business rules (as implemented)

- Small Yango fleet in Luanda: Suzuki S-Presso, 3 cars today, target 5 by Dec 2026, car 4 planned for 2026-12-01.
- Each driver is assigned to one vehicle and owes a **fixed weekly rent in AOA**, stored per assignment in `rent_schedule`.
- Rent week = Monday–Sunday, Luanda time (UTC+1, no DST). Deadline = Sunday 23:59:59 Luanda = Monday 00:00 Luanda.
- Weekly status: `PAID` (paid ≥ expected), `PARTIAL` (0 < paid < expected), `MISSED` (0 paid and deadline passed),
  `PENDING` (0 paid, week not over), `EXEMPT` (nothing expected, e.g. full-week downtime).
- Expected rent is **pro-rated by active days**: `weekly_rent × active_days / 7`, rounded to whole kwanza. Active days =
  days covered by a schedule minus days covered by `vehicle_downtime`. A driver joining Thursday owes 4/7.
- Roles: `owner` > `admin` > `driver`. Owner/admin ("staff") see everything; drivers see only their own rows.
- UI language: European Portuguese. Money always through `formatAOA`.

## 2. Tables (all in `public`, migrations in `fleet/supabase/migrations/`)

| table | key columns | notes |
| --- | --- | --- |
| `profiles` | `id`=auth.users.id, `role` user_role, `driver_id` | auto-created by trigger on signup, role defaults to `driver` |
| `drivers` | `full_name`, `phone_e164`, `active` | phone must be E.164 (`+244…`) for wa.me links |
| `vehicles` | `plate` (unique), `model`, `in_service_from`, `in_service_to`, `odometer_km` | odometer auto-bumped by maintenance events |
| `rent_schedule` | `driver_id`, `vehicle_id`, `weekly_rent_aoa`, `valid_from`, `valid_to` | **is** the driver↔vehicle assignment; GiST exclusion prevents overlapping periods per driver and per vehicle |
| `vehicle_downtime` | `vehicle_id`, `from_date`, `to_date`, `reason` | removes expected rent for those days |
| `rent_payments` | `driver_id`, `week_start` (must be Monday), `amount_aoa`, `paid_at`, `method`, `note`, `recorded_by` | several partial payments per week allowed |
| `rent_alerts` | `driver_id`, `week_start`, `status`, `expected/paid/outstanding_aoa`, `acknowledged_at` | unique per driver+week; written by cron |
| `whatsapp_messages` | `driver_id`, `week_start`, `phone_e164`, `message`, `sent_by`, `sent_at` | one row per "Enviar via WhatsApp" click |
| `receipts` | `vehicle_id`, `storage_path`, `mime_type`, `uploaded_by`, `extraction` jsonb, `extraction_provider` | file lives in private bucket `receipts` |
| `maintenance_events` | `vehicle_id` (not null), `receipt_id`, `event_date`, `category` (not null), `odometer_km`, `total_aoa`, `vendor`, `notes`, `line_items` jsonb | **single source of truth for expenses**; feeds the model |
| `maintenance_rules` | `category` (unique), `every_km`, `every_months`, `active` | seeded: oil 5000 km/6 mo, brakes 20000 km, tyres 40000 km, insurance 12 mo, licensing 12 mo |
| `fleet_targets` | single row id=1: `net_per_car_month_aoa` 351000, `free_cash_per_car_month_aoa` 147500, `reserve_rate_aoa_month` 203500, `inflation_rate_yearly` 0.20, `reserve_base_year` 2026, `car4_purchase_date`, `car4_private_injection_aoa` 12300000, `passive_income_goal_aoa_month` 4000000, `fleet_size_target_2026` 5 | owner-editable in /definicoes |
| `cash_positions` | `as_of`, `cash_aoa`, `note` | dashboard uses the latest row |
| `score_weights` | single row: `on_time_pct` 40, `shortfall_pct` 25, `incidents_pct` 25, `downtime_pct` 10, `min_weeks` 4, `window_weeks` 12 | check: weights sum to 100 |
| `agent_runs` | `kind` (rent_alerts / weekly_brief / receipt_extraction), `status`, `model`, `input`, `output`, tokens, `error` | log of every automation |

Enums: `user_role`, `payment_method` (transfer, cash, multicaixa, other), `rent_status`, `expense_category`
(fuel, oil_service, tyres, brakes, repair, insurance, licensing, wash, fine, other).

### SQL functions and views

- `week_status(p_week_start date, p_as_of timestamptz = now()) → setof week_status_row`: one row per driver with a schedule
  overlapping the week. `p_as_of` makes MISSED deterministic in tests and cron.
- `week_status_range(p_from, p_to, p_as_of)`: every week between two dates. Used by history, scorecard, monthly facts.
- `generate_rent_alerts(p_week_start = last week)`: upserts `rent_alerts` for PARTIAL/MISSED. Security definer.
- `vehicle_month_facts(p_from, p_to, p_as_of)`: per vehicle per month: `days_in_month`, `active_days` (in-service days),
  `downtime_days`, `rent_expected_aoa`, `rent_paid_aoa` (attributed to the month of the rent week's Monday), `expenses_aoa`.
  **No model maths in SQL**; that is in `src/lib/model`.
- Views: `vehicle_month_category_costs`, `vehicle_last_events` (last event per vehicle+category), `driver_incidents`
  (repair/brakes/tyres/fine events joined to the driver who held the car on that date).
- Helpers: `luanda_today()`, `week_start_of(date)`, `is_staff()`, `current_user_role()`, `current_driver_id()`.

## 3. Currency (AOA)

- DB: `numeric(14,2)`, column suffix `_aoa`. PostgREST returns numerics as strings: coerce with `num()` from `src/lib/supabase/types.ts`
  (the `src/lib/data/*` loaders already do this).
- UI: `formatAOA(n)` in `src/lib/format.ts` → `"105 000 Kz"` (non-breaking spaces, whole kwanza; `{decimals, signed}` options).
  Deterministic, no `Intl`, so server and client render identically. Also `formatPct`, `formatKm`, `formatDate` (dd/mm/yyyy),
  `formatWeek` ("3–9 ago"), `formatMonth`, `formatDateTime` (Luanda).

## 4. Time

`src/lib/time.ts`: dates are ISO `YYYY-MM-DD` strings in Luanda local time. `luandaToday()`, `weekStartOf`, `addDays`,
`addMonths`, `monthsBetween`, `weeksBetween`, `weekDeadlineUtc`. Never use `new Date()` in server components (React purity
lint); call `luandaToday()` once at the top of the page.

## 5. Roles / RBAC

- RLS on every table. Policies use `is_staff()` / `current_driver_id()` (security-definer helpers). Drivers: own
  `rent_payments`, own `rent_schedule`, own `drivers` row, vehicles they are assigned to, their own receipts. Staff: all.
  Only `owner` may update `fleet_targets`, `score_weights`, `profiles`.
- `week_status()` runs with invoker rights, so a driver calling it only sees themself (tested in `test/sql/rls.test.sql`).
- App side: `requireUser()`, `requireStaff()`, `requireOwner()` in `src/lib/auth.ts`; `src/proxy.ts` (Next 16 middleware)
  refreshes the session cookie and redirects anonymous users to `/login`. Cron routes check `Authorization: Bearer CRON_SECRET`
  and use the service-role client (`src/lib/supabase/admin.ts`).

## 6. Uploads / receipts

- Private Storage bucket `receipts`, object path `<vehicle_id>/<uuid>.<ext>`; policies mirror the table (staff read all,
  uploader reads own). Signed URLs (10 min) for viewing.
- Flow (`/recibos/novo`): choose file → "Analisar recibo" posts to `POST /api/receipts/extract` → `ReceiptDraft` pre-fills
  the form → owner reviews → "Guardar despesa" (server action `saveReceiptEvent`) uploads the file, inserts `receipts`
  and `maintenance_events`. Nothing is auto-committed. Max 10 MB; JPG/PNG/WEBP/GIF/PDF.
- `extractReceipt(file)` in `src/lib/receipts/extract.ts` has two providers: `AnthropicReceiptExtractor` (Messages API,
  vision + structured output via `messages.parse` + zod) and `noopExtractor` (empty draft). Chosen by `RECEIPT_EXTRACTOR`
  (`anthropic` | `none`), defaulting to anthropic when `ANTHROPIC_API_KEY` is set. Model from `ANTHROPIC_MODEL` (default `claude-opus-5`).

## 7. Dashboard data flow

Server components call `src/lib/data/*` with the per-request Supabase client (`src/lib/supabase/server.ts`), which
call SQL functions/views and hand plain rows to pure modules:

- `src/lib/data/model.ts#getModelVsActual` → `vehicle_month_facts` → `computeVehicleMonth` → `aggregateFleet` → `car4Countdown`.
- `src/lib/data/scorecard.ts#getScorecard` → `week_status_range` (current + previous 12-week windows), `driver_incidents`,
  `vehicle_downtime` → `computeDriverScore`, `trendOf`, `rankDrivers`.
- `src/lib/data/maintenance.ts#getReminders` → `maintenance_rules` + `vehicle_last_events` → `evaluateVehicle`.
- `src/lib/data/brief.ts#buildBriefInput` bundles all of the above for the weekly agent.
- `GET /api/export` builds the XLSX (`src/lib/export/xlsx.ts`) with sheets Cobrança, Pagamentos, Despesas,
  **Model vs Actual**, Scorecard, Viaturas from the same loaders (one source of truth).

### Model rules (`src/lib/model/model.ts`)

- Per vehicle per calendar month, `prorate = active_days / days_in_month`.
- `net = rent_paid − expenses`; `target_net = 351 000 × prorate`.
- Reserve rate for a month = `reserve_rate × (1 + inflation)^(year − base_year)` (stepped yearly).
  `target_reserve = rate × prorate`; **actual reserve = clamp(net, 0, target_reserve)** (you can only set aside what you
  netted). `free_cash = net − reserve`. Cumulative series are sums over months.
- Net per car = fleet net / sum of prorates ("car-equivalents"). Collection rate = paid / expected.
- Car 4: `injection_required = max(0, 12 300 000 − cumulative reserve − latest cash position)`.

### Scorecard rules (`src/lib/scorecard/score.ts`)

Scored weeks exclude PENDING and EXEMPT. On-time = share of scored weeks PAID. Shortfall = 100 × (1 − outstanding/expected).
Incidents = 100 − cost share of expected rent × 100 − 10 per incident (floored at 0). Downtime = 100 × (1 − days / window
days). Score = Σ weight × component / 100. Fewer than `min_weeks` scored weeks → `score = null` ("dados insuficientes"),
breakdown still shown. Trend compares with the previous 12-week window (±2 points = flat).

### Reminder rules (`src/lib/maintenance/rules.ts`)

`due` when within 500 km or 30 days of the interval, `overdue` when past, `never` when no event of that category exists;
worst of km/date wins.

## 8. Automation (the "agents")

| job | schedule (Luanda) | where |
| --- | --- | --- |
| Rent alerts | Monday 08:00 | `GET /api/cron/rent-alerts` → `generate_rent_alerts()`; `vercel.json` cron `0 7 * * 1` |
| Weekly operations brief | Monday 08:30 | `GET /api/cron/weekly-brief` → `buildBriefInput` → `generateWeeklyBrief` (Claude, or a deterministic template without a key) → `agent_runs`; shown on /painel and /agente |
| Receipt extraction | on demand | `POST /api/receipts/extract` |

Both can also be run by hand from `/agente`. Nothing is ever sent to a driver automatically: WhatsApp drafts require a click
and every send is logged in `whatsapp_messages`.

## 9. Conventions

- Folder layout: `src/app/(app)/<page>/page.tsx` (server), `actions.ts` (server actions, zod-validated, return
  `ActionResult`), client components alongside. Shared UI in `src/components/ui.tsx`; charts (Recharts) in `src/components/Charts.tsx`.
- Naming: snake_case in DB and API JSON, camelCase in TS functions, `_aoa` money, `_km` distance.
- Pages are `force-dynamic`; after a mutation call `revalidatePath`.
- Tests: Vitest for pure modules (`src/**/*.test.ts`, 36 tests); SQL tests in `fleet/test/sql/*.test.sql` run by
  `scripts/test-sql.sh` against a scratch Postgres (shim for `auth`/`storage` in `test/sql/shim.sql`). `npm run check` =
  typecheck + lint + unit tests.
- No new UI libraries: Tailwind + hand-written components; Recharts for charts; SheetJS (`xlsx`) for export.

## 10. Environment

See `fleet/.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`CRON_SECRET`, `ANTHROPIC_API_KEY` (optional), `ANTHROPIC_MODEL`, `RECEIPT_EXTRACTOR`, `NEXT_PUBLIC_FLEET_NAME`.

## 11. Known gaps / next steps

1. Auth is email + password only; no invite flow. Owner must create users in Supabase Auth and promote in /definicoes.
2. No edit/delete UI for payments, events or schedules beyond "terminar atribuição" (do it in Supabase Studio for now).
3. Reminder thresholds (500 km / 30 days) are constants, not settings.
4. XLSX export covers the last 26 weeks of rent status; older weeks are still in the DB.
5. Cron secrets: Vercel injects `CRON_SECRET` automatically as the bearer token only when the env var is set in the project.
6. The weekly brief and receipt extraction are billed to `ANTHROPIC_API_KEY`; usage is visible per run in /agente.
