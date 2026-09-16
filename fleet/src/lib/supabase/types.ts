import type { ExpenseCategory } from "@/lib/maintenance/categories";

export type UserRole = "owner" | "admin" | "driver";
export type RentStatus = "PAID" | "PARTIAL" | "MISSED" | "PENDING" | "EXEMPT";
export type PaymentMethod = "transfer" | "cash" | "multicaixa" | "other";

export type Profile = { id: string; full_name: string | null; role: UserRole; driver_id: string | null; created_at: string };
export type Driver = { id: string; full_name: string; phone_e164: string | null; active: boolean; notes: string | null; created_at: string };
export type Vehicle = {
  id: string; plate: string; model: string; in_service_from: string; in_service_to: string | null; odometer_km: number; purchase_price_aoa: number | null; created_at: string;
};
export type RentSchedule = {
  id: string; driver_id: string; vehicle_id: string; weekly_rent_aoa: number; valid_from: string; valid_to: string | null; created_at: string;
};
export type VehicleDowntime = { id: string; vehicle_id: string; from_date: string; to_date: string; reason: string; created_at: string };
export type RentPayment = {
  id: string; driver_id: string; week_start: string; amount_aoa: number; paid_at: string; method: PaymentMethod; note: string | null;
  recorded_by: string | null; created_at: string;
};
export type RentAlert = {
  id: string; driver_id: string; vehicle_id: string | null; week_start: string; status: RentStatus; expected_aoa: number; paid_aoa: number;
  outstanding_aoa: number; created_at: string; updated_at: string; acknowledged_at: string | null; acknowledged_by: string | null;
};
export type WhatsappMessage = {
  id: string; driver_id: string; week_start: string; phone_e164: string | null; message: string; sent_by: string | null; sent_at: string;
};
export type WeekStatusRow = {
  driver_id: string; driver_name: string; phone_e164: string | null; vehicle_id: string; plate: string; week_start: string;
  active_days: number; weekly_rent_aoa: number; expected_aoa: number; paid_aoa: number; outstanding_aoa: number; status: RentStatus; deadline: string;
};
export type Receipt = {
  id: string; vehicle_id: string | null; storage_path: string; mime_type: string; file_size: number | null; uploaded_by: string | null;
  uploaded_at: string; extraction: unknown; extraction_provider: string | null;
};
export type MaintenanceEvent = {
  id: string; vehicle_id: string; receipt_id: string | null; event_date: string; category: ExpenseCategory; odometer_km: number | null;
  total_aoa: number; vendor: string | null; notes: string | null; line_items: { description: string; qty: number; unit_price_aoa: number }[];
  created_by: string | null; created_at: string;
};
export type MaintenanceRuleRow = {
  id: string; category: ExpenseCategory; label: string; every_km: number | null; every_months: number | null; active: boolean;
};
export type FleetTargetsRow = {
  id: number; net_per_car_month_aoa: number; free_cash_per_car_month_aoa: number; reserve_rate_aoa_month: number; inflation_rate_yearly: number;
  reserve_base_year: number; car4_purchase_date: string; car4_private_injection_aoa: number; passive_income_goal_aoa_month: number;
  fleet_size_target_2026: number; fx_aoa_per_eur: number; loan_installment_eur: number; loan_principal_eur: number; loan_start_date: string; loan_months: number; updated_at: string;
};
export type CashPosition = { id: string; as_of: string; cash_aoa: number; note: string | null; created_at: string };
export type ScoreWeightsRow = {
  id: number; on_time_pct: number; shortfall_pct: number; incidents_pct: number; downtime_pct: number; min_weeks: number; window_weeks: number;
};
export type AgentRun = {
  id: string; kind: string; status: string; model: string | null; input: unknown; output: string | null; tokens_in: number | null;
  tokens_out: number | null; error: string | null; ran_at: string;
};
export type VehicleMonthFactRow = {
  vehicle_id: string; plate: string; month: string; days_in_month: number; active_days: number; downtime_days: number;
  rent_expected_aoa: number; rent_paid_aoa: number; expenses_aoa: number;
};

/** Postgres numeric columns arrive as strings through PostgREST; coerce the ones we do maths on. */
export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return 0;
}
