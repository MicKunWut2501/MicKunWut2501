import * as XLSX from "xlsx";
import type { ModelVsActual } from "@/lib/data/model";
import type { WeekStatusRow, MaintenanceEvent, RentPayment, Vehicle, Driver } from "@/lib/supabase/types";
import type { RankedDriver } from "@/lib/data/scorecard";
import { CATEGORY_LABELS } from "@/lib/maintenance/categories";

export type ExportInput = {
  generatedAt: string;
  vehicles: Vehicle[];
  drivers: Driver[];
  weeks: WeekStatusRow[];
  payments: RentPayment[];
  events: MaintenanceEvent[];
  model: ModelVsActual;
  scorecard: RankedDriver[];
};

const n = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

/** Builds the workbook. Sheets: Rent, Payments, Expenses, Model vs Actual, Scorecard, Vehicles. */
export function buildWorkbook(i: ExportInput): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const plate = new Map(i.vehicles.map((v) => [v.id, v.plate]));
  const dname = new Map(i.drivers.map((d) => [d.id, d.full_name]));

  const cobranca = i.weeks.map((w) => ({
    Week: w.week_start, Driver: w.driver_name, Vehicle: w.plate, Status: w.status, "Active days": w.active_days,
    "Expected (Kz)": n(w.expected_aoa), "Paid (Kz)": n(w.paid_aoa), "Outstanding (Kz)": n(w.outstanding_aoa),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cobranca), "Rent");

  const pagamentos = i.payments.map((p) => ({
    Date: p.paid_at, Week: p.week_start, Driver: dname.get(p.driver_id) ?? p.driver_id, "Amount (Kz)": n(p.amount_aoa), Method: p.method, Note: p.note ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pagamentos), "Payments");

  const despesas = i.events.map((e) => ({
    Date: e.event_date, Vehicle: plate.get(e.vehicle_id) ?? e.vehicle_id, Category: CATEGORY_LABELS[e.category], "Total (Kz)": n(e.total_aoa),
    "Odometer (km)": e.odometer_km ?? "", Vendor: e.vendor ?? "", Notes: e.notes ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(despesas), "Expenses");

  // Model vs Actual: fleet block then per-vehicle block
  const t = i.model.targets;
  const fleetRows = i.model.fleetMonths.map((m) => ({
    Level: "Fleet", Month: m.month, Vehicle: "", "Car-equivalents": n(m.car_equivalents),
    "Rent expected (Kz)": n(m.rent_expected_aoa), "Rent collected (Kz)": n(m.rent_paid_aoa), "Collection rate": n(m.collection_rate),
    "Expenses (Kz)": n(m.expenses_aoa), "Net (Kz)": n(m.net_aoa), "Target net (Kz)": n(m.target_net_aoa),
    "Net per car (Kz)": n(m.net_per_car_aoa), "Target per car (Kz)": n(m.target_net_per_car_aoa),
    "Reserve (Kz)": n(m.reserve_aoa), "Model reserve (Kz)": n(m.target_reserve_aoa), "Cumulative reserve (Kz)": n(m.cum_reserve_aoa), "Cumulative model reserve (Kz)": n(m.cum_target_reserve_aoa),
    "Free cash (Kz)": n(m.free_cash_aoa), "Model free cash (Kz)": n(m.target_free_cash_aoa),
  }));
  const vehicleRows = i.model.vehicleMonths.map((v) => ({
    Level: "Vehicle", Month: v.month, Vehicle: v.plate, "Car-equivalents": n(v.prorate),
    "Rent expected (Kz)": n(v.rent_expected_aoa), "Rent collected (Kz)": n(v.rent_paid_aoa), "Collection rate": n(v.collection_rate),
    "Expenses (Kz)": n(v.expenses_aoa), "Net (Kz)": n(v.net_aoa), "Target net (Kz)": n(v.target_net_aoa),
    "Net per car (Kz)": n(v.prorate > 0 ? v.net_aoa / v.prorate : null), "Target per car (Kz)": n(t.net_per_car_month_aoa),
    "Reserve (Kz)": n(v.reserve_aoa), "Model reserve (Kz)": n(v.target_reserve_aoa), "Cumulative reserve (Kz)": null, "Cumulative model reserve (Kz)": null,
    "Free cash (Kz)": n(v.free_cash_aoa), "Model free cash (Kz)": n(v.target_free_cash_aoa),
  }));
  const header = [
    ["Model vs Actual", "generated", i.generatedAt],
    ["Target net/car/month", t.net_per_car_month_aoa, "Free cash/car/month", t.free_cash_per_car_month_aoa, "Reserve/car/month", t.reserve_rate_aoa_month, "Inflation", t.inflation_rate_yearly],
    ["Car 4", t.car4_purchase_date, "Planned injection", t.car4_private_injection_aoa, "Cumulative reserve", i.model.car4.reserve_balance_aoa, "Cash on hand", i.model.car4.cash_on_hand_aoa, "Injection required", i.model.car4.injection_required_aoa, "Days", i.model.car4.days_remaining],
    [],
  ];
  const ws = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(ws, [...fleetRows, ...vehicleRows], { origin: "A5" });
  XLSX.utils.book_append_sheet(wb, ws, "Model vs Actual");

  const score = i.scorecard.map((d, idx) => ({
    Rank: d.score === null ? "" : idx + 1, Driver: d.driver_name, Score: d.score ?? "insufficient data", Trend: d.trend, "Previous score": d.previous_score ?? "",
    "Scored weeks": d.scored_weeks, "Tenure (weeks)": d.tenure_weeks,
    ...Object.fromEntries(d.components.flatMap((c) => [[`${c.label} (value)`, c.raw_label], [`${c.label} (0-100)`, c.score], [`${c.label} (weight %)`, c.weight_pct]])),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(score), "Scorecard");

  const viaturas = i.vehicles.map((v) => ({ Plate: v.plate, Model: v.model, "In service from": v.in_service_from, "Until": v.in_service_to ?? "", "Odometer (km)": v.odometer_km }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(viaturas), "Vehicles");
  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
