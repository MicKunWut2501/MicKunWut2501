#!/usr/bin/env python3
"""Generate SQL that loads the owner's 'Cashflow Yango' workbook into the fleet schema.

Usage: python3 scripts/import-cashflow.py path/to/workbook.xlsx > import.sql
The sheet has one 7-column block per vehicle: Date (Sunday ending the rent week), Exchange Rate,
Gross Revenue - AOA (rent received), Expenses, Net Profit AOA/EUR, deposit status.
Rules: week_start = Sunday - 6; revenue > 0 -> rent_payments row; expenses > 0 -> maintenance_events
row (category 'other', to be recategorised); weekly rent = value that persists >= 3 consecutive weeks.
Rows with an empty revenue (future weeks) are skipped.
"""
import sys, re, datetime as dt, openpyxl

BLOCK_COLS = [2, 11, 20, 29]  # 1-based column of "Date" in each vehicle block
WEEK_RE = re.compile(r"LDA\s*([0-9]{2})\s*-\s*([0-9]{2})\s*-\s*([A-Z]{2})\s*//\s*Sr\.\s*(\w+)")
PRICES = {"LDA-10-53-AG": 10600000, "LDA-72-39-AH": 9400000, "LDA-13-06-AN": 9700000}
IDS = {"LDA-10-53-AG": ("11111111-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000001"),
       "LDA-72-39-AH": ("11111111-0000-4000-8000-000000000002", "aaaaaaaa-0000-4000-8000-000000000002"),
       "LDA-13-06-AN": ("11111111-0000-4000-8000-000000000003", "aaaaaaaa-0000-4000-8000-000000000003")}

def q(s): return "'" + str(s).replace("'", "''") + "'"

def segments(weeks):
    """weeks: list of (sunday, revenue). Returns [(start_monday, end_sunday|None, rent)]."""
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

def main(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    sql = ["begin;"]
    for c in BLOCK_COLS:
        title_row = next((r for r in range(1, 12) if isinstance(ws.cell(row=r, column=c).value, str) and "LDA" in ws.cell(row=r, column=c).value), None)
        if title_row is None: continue
        m = WEEK_RE.search(ws.cell(row=title_row, column=c).value)
        if not m: continue
        plate = f"LDA-{m.group(1)}-{m.group(2)}-{m.group(3)}"; driver = m.group(4)
        phone = ws.cell(row=title_row, column=c + 6).value
        vid, did = IDS[plate]
        weeks = []
        for r in range(title_row + 2, ws.max_row + 1):
            d = ws.cell(row=r, column=c).value
            if not isinstance(d, dt.datetime): continue
            rev = ws.cell(row=r, column=c + 2).value
            exp = ws.cell(row=r, column=c + 3).value
            if rev is None: continue  # future week
            weeks.append((d.date(), float(rev or 0), float(exp or 0)))
        if not weeks: continue
        first_monday = weeks[0][0] - dt.timedelta(days=6)
        sql.append(f"insert into public.vehicles (id, plate, model, in_service_from, odometer_km, purchase_price_aoa) values ({q(vid)}, {q(plate)}, 'Suzuki S-Presso', {q(first_monday)}, 0, {PRICES.get(plate, 'null')});")
        sql.append(f"insert into public.drivers (id, full_name, phone_e164) values ({q(did)}, {q(driver)}, {q('+244' + str(phone)) if phone else 'null'});")
        for start, end, rent in segments([(s, v) for s, v, _ in weeks]):
            sql.append(f"insert into public.rent_schedule (driver_id, vehicle_id, weekly_rent_aoa, valid_from, valid_to) values ({q(did)}, {q(vid)}, {rent:.2f}, {q(start)}, {q(end) if end else 'null'});")
        for sun, rev, exp in weeks:
            ws_ = sun - dt.timedelta(days=6)
            if rev > 0:
                sql.append(f"insert into public.rent_payments (driver_id, week_start, amount_aoa, paid_at, method, note, source) values ({q(did)}, {q(ws_)}, {rev:.2f}, {q(str(sun) + ' 18:00+01')}, 'transfer', 'Imported from cashflow sheet', 'cashflow_xlsx');")
            if exp > 0:
                note = "Recurring weekly cost (cashflow sheet)" if exp in (5500.0, 1500.0) else "Weekly expenses incl. maintenance (cashflow sheet); recategorise if needed"
                sql.append(f"insert into public.maintenance_events (vehicle_id, event_date, category, total_aoa, notes, source) values ({q(vid)}, {q(sun)}, 'other', {exp:.2f}, {q(note)}, 'cashflow_xlsx');")
    sql.append("commit;")
    print("\n".join(sql))

if __name__ == "__main__":
    main(sys.argv[1])
