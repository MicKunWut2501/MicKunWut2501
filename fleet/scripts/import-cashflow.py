#!/usr/bin/env python3
"""Sync the owner's 'Cashflow Yango' workbook into the fleet database (Excel is the source of truth).

Usage: python3 -I scripts/import-cashflow.py [--dry-run] path/to/workbook.xlsx > sync.sql
  --dry-run ends the transaction with ROLLBACK, so running it only prints what would change.

Sheet layout: one 7-column block per vehicle. Title row "Suzuki Spresso: LDA 10-53-AG // Sr. Raul" with the driver's
phone 6 columns right; header row below; then one row per week: Date (Sunday ending the rent week), Exchange Rate,
Gross Revenue - AOA (rent received), Expenses, Net Profit AOA/EUR, deposit status. Rows with empty revenue = future.

What the generated SQL does, idempotently (safe to run again with the same or a newer file):
- vehicles / drivers: upsert by deterministic id (plate / driver), keeping odometer, GPS links and app-only fields
- rent_schedule: rebuilt per driver from the sheet (weekly rent = amount persisting >= 3 consecutive weeks)
- rent_payments with source 'cashflow_xlsx': insert new weeks, update changed amounts, delete weeks no longer in the sheet
- maintenance_events with source 'cashflow_xlsx': same, keyed by vehicle + date; the category set in the app is kept
Rows entered in the app (source is null) are never touched.
"""
import sys, re, uuid, datetime as dt, openpyxl

BLOCK_COLS = [2, 11, 20, 29]  # 1-based column of "Date" in each vehicle block
TITLE_RE = re.compile(r"LDA\s*([0-9]{2})\s*-\s*([0-9]{2})\s*-\s*([A-Z]{2})\s*//\s*Sr\.\s*(\w+)")
PRICES = {"LDA-10-53-AG": 10600000, "LDA-72-39-AH": 9400000, "LDA-13-06-AN": 9700000}
# ids used by the first import (2026-09-16); new plates get a deterministic uuid5
KNOWN_IDS = {"LDA-10-53-AG": ("11111111-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000001"),
             "LDA-72-39-AH": ("11111111-0000-4000-8000-000000000002", "aaaaaaaa-0000-4000-8000-000000000002"),
             "LDA-13-06-AN": ("11111111-0000-4000-8000-000000000003", "aaaaaaaa-0000-4000-8000-000000000003")}
NS = uuid.UUID("6f1d0c3e-6a52-4c0b-9b52-4f6c1a0d7e11")

def q(s): return "'" + str(s).replace("'", "''") + "'"

def ids_for(plate, driver):
    if plate in KNOWN_IDS: return KNOWN_IDS[plate]
    return str(uuid.uuid5(NS, "vehicle:" + plate)), str(uuid.uuid5(NS, "driver:" + plate + ":" + driver))

def segments(weeks):
    """weeks: [(sunday, revenue)] with revenue > 0 where paid. Returns [(start_monday, end_sunday|None, rent)]."""
    vals = [v for _, v in weeks]
    first = next((v for v in vals if v), None)
    if first is None: return []
    cur = first; start = weeks[0][0] - dt.timedelta(days=6); out = []
    for i, (sun, v) in enumerate(weeks):
        if v and v != cur and i + 2 < len(weeks) and weeks[i+1][1] == v and weeks[i+2][1] == v:
            out.append((start, sun - dt.timedelta(days=7), cur))
            cur = v; start = sun - dt.timedelta(days=6)
    out.append((start, None, cur))
    return out

class StaleFormulas(Exception):
    pass

def read_blocks(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    wf = openpyxl.load_workbook(path, data_only=False).worksheets[0]

    def value(r, c):
        """Cell value; refuses formula cells without a cached result (file saved by a tool that does not calculate)."""
        v = ws.cell(row=r, column=c).value
        f = wf.cell(row=r, column=c).value
        if v is None and isinstance(f, str) and f.startswith("="):
            raise StaleFormulas(f"cell {wf.cell(row=r, column=c).coordinate} has formula {f} but no calculated value")
        return v

    blocks = []
    for c in BLOCK_COLS:
        title_row = next((r for r in range(1, 12) if isinstance(ws.cell(row=r, column=c).value, str) and "LDA" in ws.cell(row=r, column=c).value), None)
        if title_row is None: continue
        m = TITLE_RE.search(ws.cell(row=title_row, column=c).value)
        if not m: continue  # e.g. the empty car-4 block "Suzuki Spresso: LDA "
        plate = f"LDA-{m.group(1)}-{m.group(2)}-{m.group(3)}"; driver = m.group(4)
        phone = ws.cell(row=title_row, column=c + 6).value
        weeks = []
        for r in range(title_row + 2, ws.max_row + 1):
            d = ws.cell(row=r, column=c).value
            if not isinstance(d, dt.datetime): continue
            if d.weekday() != 6:  # a mistyped date (e.g. Saturday) is snapped to the Sunday ending that week
                d = d + dt.timedelta(days=6 - d.weekday())
            rev = value(r, c + 2)
            exp = value(r, c + 3)
            if rev is None: continue  # future week
            weeks.append((d.date(), float(rev or 0), float(exp or 0)))
        if weeks: blocks.append((plate, driver, phone, weeks))
    return blocks

def main(path, dry_run=False):
    try:
        blocks = read_blocks(path)
    except StaleFormulas as e:
        sys.exit(f"Refusing to import: {e}. Open the workbook in Excel or Numbers, save it once, and try again.")
    sql = ["begin;"]
    for plate, driver, phone, weeks in blocks:
        vid, did = ids_for(plate, driver)
        first_monday = weeks[0][0] - dt.timedelta(days=6)
        price = PRICES.get(plate)
        sql.append(f"insert into public.vehicles (id, plate, model, in_service_from, odometer_km, purchase_price_aoa) values ({q(vid)}, {q(plate)}, 'Suzuki S-Presso', {q(first_monday)}, 0, {price if price else 'null'}) "
                   f"on conflict (id) do update set plate = excluded.plate, in_service_from = least(public.vehicles.in_service_from, excluded.in_service_from), purchase_price_aoa = coalesce(public.vehicles.purchase_price_aoa, excluded.purchase_price_aoa);")
        sql.append(f"insert into public.drivers (id, full_name, phone_e164) values ({q(did)}, {q(driver)}, {q('+244' + str(phone)) if phone else 'null'}) "
                   f"on conflict (id) do update set full_name = excluded.full_name, phone_e164 = coalesce(excluded.phone_e164, public.drivers.phone_e164);")
        sql.append(f"delete from public.rent_schedule where driver_id = {q(did)};")
        for start, end, rent in segments([(s, v) for s, v, _ in weeks]):
            sql.append(f"insert into public.rent_schedule (driver_id, vehicle_id, weekly_rent_aoa, valid_from, valid_to) values ({q(did)}, {q(vid)}, {rent:.2f}, {q(start)}, {q(end) if end else 'null'});")

        pay = [f"({q(did)}::uuid,{q(s - dt.timedelta(days=6))}::date,{rev:.2f}::numeric,{q(str(s) + ' 18:00+01')}::timestamptz)" for s, rev, _ in weeks if rev > 0]
        values = ",".join(pay) if pay else f"({q(did)}::uuid,null::date,null::numeric,null::timestamptz)"
        sql.append(f"""with t(d, w, a, p) as (values {values}),
  upd as (update public.rent_payments rp set amount_aoa = t.a, paid_at = t.p from t
          where rp.source = 'cashflow_xlsx' and rp.driver_id = t.d and rp.week_start = t.w and rp.amount_aoa <> t.a returning rp.id),
  ins as (insert into public.rent_payments (driver_id, week_start, amount_aoa, paid_at, method, note, source)
          select t.d, t.w, t.a, t.p, 'transfer', 'Imported from cashflow sheet', 'cashflow_xlsx' from t
          where t.w is not null and not exists (select 1 from public.rent_payments rp where rp.source = 'cashflow_xlsx' and rp.driver_id = t.d and rp.week_start = t.w) returning id),
  del as (delete from public.rent_payments rp where rp.source = 'cashflow_xlsx' and rp.driver_id = {q(did)}
          and not exists (select 1 from t where t.w = rp.week_start) returning rp.id)
select {q(plate)} as plate, 'payments' as kind, (select count(*) from ins) as added, (select count(*) from upd) as changed, (select count(*) from del) as removed;""")

        exps = [f"({q(vid)}::uuid,{q(s)}::date,{exp:.2f}::numeric,{q('R' if exp in (5500.0, 1500.0) else 'M')})" for s, _, exp in weeks if exp > 0]
        values = ",".join(exps) if exps else f"({q(vid)}::uuid,null::date,null::numeric,null)"
        sql.append(f"""with t(v, e, a, n) as (values {values}),
  upd as (update public.maintenance_events me set total_aoa = t.a from t
          where me.source = 'cashflow_xlsx' and me.vehicle_id = t.v and me.event_date = t.e and me.total_aoa <> t.a returning me.id),
  ins as (insert into public.maintenance_events (vehicle_id, event_date, category, total_aoa, notes, source)
          select t.v, t.e, 'other', t.a, case t.n when 'R' then 'Recurring weekly cost (cashflow sheet)' else 'Weekly expenses incl. maintenance (cashflow sheet); recategorise if needed' end, 'cashflow_xlsx' from t
          where t.e is not null and not exists (select 1 from public.maintenance_events me where me.source = 'cashflow_xlsx' and me.vehicle_id = t.v and me.event_date = t.e) returning id),
  del as (delete from public.maintenance_events me where me.source = 'cashflow_xlsx' and me.vehicle_id = {q(vid)}
          and not exists (select 1 from t where t.e = me.event_date) returning me.id)
select {q(plate)} as plate, 'expenses' as kind, (select count(*) from ins) as added, (select count(*) from upd) as changed, (select count(*) from del) as removed;""")
    sql.append("rollback;" if dry_run else "commit;")
    print("\n".join(sql))

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    main(args[0], dry_run="--dry-run" in sys.argv[1:])
