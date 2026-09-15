import "server-only";
import type { SB } from "./fleet";
import type { MaintenanceEvent, MaintenanceRuleRow, Receipt, Vehicle } from "@/lib/supabase/types";
import { num } from "@/lib/supabase/types";
import type { ExpenseCategory } from "@/lib/maintenance/categories";
import { evaluateVehicle, type DueResult, type LastEvent, type MaintenanceRule } from "@/lib/maintenance/rules";

export async function getEvents(sb: SB, opts: { vehicleId?: string; from?: string; to?: string; limit?: number } = {}): Promise<MaintenanceEvent[]> {
  let q = sb.from("maintenance_events").select("*").order("event_date", { ascending: false }).order("created_at", { ascending: false });
  if (opts.vehicleId) q = q.eq("vehicle_id", opts.vehicleId);
  if (opts.from) q = q.gte("event_date", opts.from);
  if (opts.to) q = q.lte("event_date", opts.to);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(`maintenance_events: ${error.message}`);
  return ((data ?? []) as MaintenanceEvent[]).map((e) => ({ ...e, total_aoa: num(e.total_aoa) }));
}

export async function getRules(sb: SB): Promise<MaintenanceRule[]> {
  const { data, error } = await sb.from("maintenance_rules").select("*").order("label");
  if (error) throw new Error(`maintenance_rules: ${error.message}`);
  return (data ?? []) as MaintenanceRuleRow[];
}

export type LastEventRow = { vehicle_id: string; category: ExpenseCategory; event_date: string; odometer_km: number | null };

export async function getLastEvents(sb: SB): Promise<LastEventRow[]> {
  const { data, error } = await sb.from("vehicle_last_events").select("vehicle_id, category, event_date, odometer_km");
  if (error) throw new Error(`vehicle_last_events: ${error.message}`);
  return (data ?? []) as LastEventRow[];
}

/** Due/overdue chips for every vehicle. */
export async function getReminders(sb: SB, vehicles: Vehicle[], today: string): Promise<Map<string, DueResult[]>> {
  const [rules, last] = await Promise.all([getRules(sb), getLastEvents(sb)]);
  const out = new Map<string, DueResult[]>();
  for (const v of vehicles) {
    const lastByCat: Partial<Record<ExpenseCategory, LastEvent>> = {};
    for (const l of last) if (l.vehicle_id === v.id) lastByCat[l.category] = { event_date: l.event_date, odometer_km: l.odometer_km };
    out.set(v.id, evaluateVehicle(rules, lastByCat, { today, odometerKm: v.odometer_km }));
  }
  return out;
}

export async function getReceipts(sb: SB, limit = 50): Promise<Receipt[]> {
  const { data, error } = await sb.from("receipts").select("*").order("uploaded_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`receipts: ${error.message}`);
  return (data ?? []) as Receipt[];
}

export async function getReceipt(sb: SB, id: string): Promise<Receipt | null> {
  const { data } = await sb.from("receipts").select("*").eq("id", id).maybeSingle();
  return (data as Receipt | null) ?? null;
}
