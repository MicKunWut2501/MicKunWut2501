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

/** Builds the workbook. Sheets: Cobrança, Pagamentos, Despesas, Model vs Actual, Scorecard, Viaturas. */
export function buildWorkbook(i: ExportInput): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const plate = new Map(i.vehicles.map((v) => [v.id, v.plate]));
  const dname = new Map(i.drivers.map((d) => [d.id, d.full_name]));

  const cobranca = i.weeks.map((w) => ({
    Semana: w.week_start, Motorista: w.driver_name, Viatura: w.plate, Estado: w.status, "Dias activos": w.active_days,
    "Esperado (Kz)": n(w.expected_aoa), "Pago (Kz)": n(w.paid_aoa), "Em falta (Kz)": n(w.outstanding_aoa),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cobranca), "Cobrança");

  const pagamentos = i.payments.map((p) => ({
    Data: p.paid_at, Semana: p.week_start, Motorista: dname.get(p.driver_id) ?? p.driver_id, "Valor (Kz)": n(p.amount_aoa), Método: p.method, Nota: p.note ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pagamentos), "Pagamentos");

  const despesas = i.events.map((e) => ({
    Data: e.event_date, Viatura: plate.get(e.vehicle_id) ?? e.vehicle_id, Categoria: CATEGORY_LABELS[e.category], "Total (Kz)": n(e.total_aoa),
    "Odómetro (km)": e.odometer_km ?? "", Fornecedor: e.vendor ?? "", Notas: e.notes ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(despesas), "Despesas");

  // Model vs Actual: fleet block then per-vehicle block
  const t = i.model.targets;
  const fleetRows = i.model.fleetMonths.map((m) => ({
    Nível: "Frota", Mês: m.month, Viatura: "", "Carros-equivalentes": n(m.car_equivalents),
    "Renda esperada (Kz)": n(m.rent_expected_aoa), "Renda cobrada (Kz)": n(m.rent_paid_aoa), "Taxa de cobrança": n(m.collection_rate),
    "Despesas (Kz)": n(m.expenses_aoa), "Líquido (Kz)": n(m.net_aoa), "Objectivo líquido (Kz)": n(m.target_net_aoa),
    "Líquido por carro (Kz)": n(m.net_per_car_aoa), "Objectivo por carro (Kz)": n(m.target_net_per_car_aoa),
    "Reserva (Kz)": n(m.reserve_aoa), "Reserva modelo (Kz)": n(m.target_reserve_aoa), "Reserva acumulada (Kz)": n(m.cum_reserve_aoa), "Reserva acumulada modelo (Kz)": n(m.cum_target_reserve_aoa),
    "Cash livre (Kz)": n(m.free_cash_aoa), "Cash livre modelo (Kz)": n(m.target_free_cash_aoa),
  }));
  const vehicleRows = i.model.vehicleMonths.map((v) => ({
    Nível: "Viatura", Mês: v.month, Viatura: v.plate, "Carros-equivalentes": n(v.prorate),
    "Renda esperada (Kz)": n(v.rent_expected_aoa), "Renda cobrada (Kz)": n(v.rent_paid_aoa), "Taxa de cobrança": n(v.collection_rate),
    "Despesas (Kz)": n(v.expenses_aoa), "Líquido (Kz)": n(v.net_aoa), "Objectivo líquido (Kz)": n(v.target_net_aoa),
    "Líquido por carro (Kz)": n(v.prorate > 0 ? v.net_aoa / v.prorate : null), "Objectivo por carro (Kz)": n(t.net_per_car_month_aoa),
    "Reserva (Kz)": n(v.reserve_aoa), "Reserva modelo (Kz)": n(v.target_reserve_aoa), "Reserva acumulada (Kz)": null, "Reserva acumulada modelo (Kz)": null,
    "Cash livre (Kz)": n(v.free_cash_aoa), "Cash livre modelo (Kz)": n(v.target_free_cash_aoa),
  }));
  const header = [
    ["Model vs Actual", "gerado", i.generatedAt],
    ["Objectivo líquido/carro/mês", t.net_per_car_month_aoa, "Cash livre/carro/mês", t.free_cash_per_car_month_aoa, "Reserva/carro/mês", t.reserve_rate_aoa_month, "Inflação", t.inflation_rate_yearly],
    ["Carro 4", t.car4_purchase_date, "Injecção prevista", t.car4_private_injection_aoa, "Reserva acumulada", i.model.car4.reserve_balance_aoa, "Caixa", i.model.car4.cash_on_hand_aoa, "Injecção necessária", i.model.car4.injection_required_aoa, "Dias", i.model.car4.days_remaining],
    [],
  ];
  const ws = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(ws, [...fleetRows, ...vehicleRows], { origin: "A5" });
  XLSX.utils.book_append_sheet(wb, ws, "Model vs Actual");

  const score = i.scorecard.map((d, idx) => ({
    Posição: d.score === null ? "" : idx + 1, Motorista: d.driver_name, Pontuação: d.score ?? "dados insuficientes", Tendência: d.trend, "Pontuação anterior": d.previous_score ?? "",
    "Semanas avaliadas": d.scored_weeks, "Antiguidade (semanas)": d.tenure_weeks,
    ...Object.fromEntries(d.components.flatMap((c) => [[`${c.label} (valor)`, c.raw_label], [`${c.label} (0-100)`, c.score], [`${c.label} (peso %)`, c.weight_pct]])),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(score), "Scorecard");

  const viaturas = i.vehicles.map((v) => ({ Matrícula: v.plate, Modelo: v.model, "Em serviço desde": v.in_service_from, "Até": v.in_service_to ?? "", "Odómetro (km)": v.odometer_km }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(viaturas), "Viaturas");
  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
