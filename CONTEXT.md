# CONTEXT.md — fleet-management app

_Written by the warm-up session on 2026-09-15. Read this before starting any of the
four feature prompts (rent collection, model-vs-reality dashboard, receipt → maintenance
log, driver scorecard)._

## 1. What the repository actually contains

**This repository (`MicKunWut2501/MicKunWut2501`) does not contain the fleet app.**

It is the GitHub profile repository. The only tracked file on `main` is `README.md`
(the profile bio). There is:

- no `package.json`, no Next.js app, no `app/` or `pages/` directory
- no `supabase/` folder, no migrations, no `schema.sql`, no RLS policies
- no dashboard, receipt-upload, XLSX-export, RBAC or currency-formatting code
- no CI, no tests, no `.env.example`

The other repository visible to this GitHub connection is
`MicKunWut2501/RepData_PeerAssessment1`, an R / Coursera fork. It is not the app either.

Consequence: every statement in the feature prompts of the form "reuse the existing
helper / dashboard / receipt code / cron mechanism" currently has nothing to reuse.
The next session must either (a) attach the real app repository if it lives somewhere
else (a different GitHub account or organisation, GitLab, a local folder), or
(b) scaffold the app from scratch in this or a new repository before any feature work.

## 2. Business context (from the prompts, not from code)

- Small Yango ride-hailing fleet in Luanda, Angola. 3 × Suzuki S-Presso today,
  target 5 vehicles by December 2026 (car 4 purchase planned 2026-12-01).
- Each driver is assigned to one vehicle and pays a **fixed weekly rent in AOA**
  (Angolan kwanza). Rent weeks run Monday–Sunday, Luanda time (UTC+1, no DST).
- Roles expected: `owner`, `admin`, `driver`. Owner/admin see everything; drivers
  see only their own data.
- UI language: European Portuguese (e.g. page "Cobrança", button "Registar pagamento").

## 3. Tables and key columns

None exist. Nothing to document.

## 4. Currency (AOA) storage and formatting

No helper exists. Recommended convention when the app is scaffolded (so all four
features share one rule):

- Store amounts as `numeric(14,2)` in columns suffixed `_aoa`
  (AOA has centimes but is effectively used in whole kwanza; keep 2 dp for safety).
- One formatter, `formatAOA(n)`, using `Intl.NumberFormat('pt-AO', { style: 'currency',
  currency: 'AOA' })` with a fallback of `"1 234 567 Kz"` where the runtime lacks
  the locale. Every feature must import this helper, never format inline.

## 5. Roles / RBAC enforcement

Not implemented. Recommended: a `profiles` table (`id` = `auth.users.id`, `role`
enum `owner|admin|driver`, `driver_id` nullable FK) plus a SQL helper
`current_role()` used in every RLS policy, and a server-side guard in Next.js
layouts for owner/admin pages.

## 6. Uploads (receipts)

Not implemented. Recommended: Supabase Storage bucket `receipts` (private), one
`receipts` row per file (`id, vehicle_id, uploaded_by, storage_path, mime_type,
uploaded_at`), signed URLs for viewing, RLS on the bucket mirroring the table.

## 7. Dashboard data fetching

Not implemented. Recommended: Next.js App Router server components calling
Supabase with the server client; heavy aggregations in SQL views / RPC functions
rather than in JS, so the XLSX export and the dashboard read the same source.

## 8. Conventions

None established. Proposed defaults for the scaffold (adopt or replace in prompt 1):

| Area | Proposal |
| --- | --- |
| Framework | Next.js (App Router, TypeScript), `src/app/**` |
| Data | Supabase (Postgres + Auth + Storage), migrations in `supabase/migrations/` |
| UI | Tailwind CSS + shadcn/ui components |
| Charts | Recharts |
| XLSX | `xlsx` (SheetJS) or `exceljs`, one export route `src/app/api/export/route.ts` |
| Tests | Vitest; SQL functions tested with pgTAP or via Supabase local + Vitest |
| Cron | Vercel cron (`vercel.json`) hitting a route handler, or Supabase Edge Function + `pg_cron` |
| Naming | snake_case in DB, camelCase in TS, `_aoa` suffix on money columns, `_km` on odometer |
| Time | store `timestamptz`; compute weeks/months in `Africa/Luanda` |

## 9. Gap list — what the four features depend on and is missing

Everything below is absent. Items marked **[blocking]** must exist before the
feature that cites them can be built.

### Foundation (blocks all four features)
1. **[blocking] The application itself** — no Next.js project, no Supabase project
   linked, no environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, …).
2. **[blocking] Auth + `profiles` + role enum + RLS helper** — RBAC is assumed by every prompt.
3. **[blocking] `drivers` table** (name, phone in E.164 for `wa.me` links, active flag).
4. **[blocking] `vehicles` table** (plate, model, `in_service_from`, `odometer_km`) —
   prompt 3 says "add if not present"; prompts 1, 2 and 4 all need it earlier, so it
   must be created in prompt 1.
5. **[blocking] Driver ↔ vehicle assignment with validity dates** — needed for
   rent schedule (1), per-car actuals (2), attributing incidents to a driver (4).
6. **[blocking] `formatAOA` helper** — prompts 1–4 say "must match the existing helper".
7. Test runner and CI — prompts 1–4 each require tests.
8. Charting library and XLSX export — prompt 2 says "reuse the existing", prompt 4 says
   "add to the existing export". Neither exists; prompt 2 will have to introduce both.

### Rent collection (prompt 1)
9. No weekly-period concept (`week_start` Monday, Luanda time) anywhere.
10. No `rent_schedule`, `rent_payments`, `rent_alerts`, `whatsapp_log` tables.
11. No cron mechanism chosen (Vercel cron vs Supabase Edge Function).
12. No "Cashflow" ledger to reuse — build fresh.

### Model-vs-reality dashboard (prompt 2)
13. No `fleet_targets`, `cash_positions` tables; no expense/receipt source for "money out".
14. No monthly pro-rating logic for partial-month vehicles.

### Receipt → maintenance log (prompt 3)
15. No receipt upload, storage bucket or `receipts` table.
16. No `maintenance_events`, expense `category` enum, or reminder rule table.
17. No extraction interface; `ANTHROPIC_API_KEY` not configured.

### Driver scorecard (prompt 4)
18. No `vehicle_downtime` table, no scoring weights table.
19. Depends on 1 and 3 being complete (rent status history, maintenance events).

## 10. Recommended next step

Before running prompt 1, decide where the app lives:

- **If the app exists elsewhere**: attach that repository to the session and re-run
  this warm-up prompt there. This file should then be rewritten from real code.
- **If it does not exist yet**: run a "prompt 0.5" that scaffolds the foundation
  (items 1–8 above) with the conventions in section 8, so that prompts 1–4 can
  genuinely "reuse the existing" pieces they reference.
