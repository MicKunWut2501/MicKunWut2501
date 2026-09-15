import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CashPosition, Driver, FleetTargetsRow, Profile, RentSchedule, ScoreWeightsRow, Vehicle, VehicleDowntime,
} from "@/lib/supabase/types";
import { num } from "@/lib/supabase/types";
import type { FleetTargets } from "@/lib/model/model";
import type { ScoreWeights } from "@/lib/scorecard/score";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SB = SupabaseClient<any, "public", any>;

function fail(ctx: string, error: { message: string } | null): never {
  throw new Error(`${ctx}: ${error?.message ?? "unknown error"}`);
}

export async function getVehicles(sb: SB): Promise<Vehicle[]> {
  const { data, error } = await sb.from("vehicles").select("*").order("plate");
  if (error) fail("vehicles", error);
  return (data ?? []) as Vehicle[];
}

export async function getVehicle(sb: SB, id: string): Promise<Vehicle | null> {
  const { data } = await sb.from("vehicles").select("*").eq("id", id).maybeSingle();
  return (data as Vehicle | null) ?? null;
}

export async function getDrivers(sb: SB): Promise<Driver[]> {
  const { data, error } = await sb.from("drivers").select("*").order("full_name");
  if (error) fail("drivers", error);
  return (data ?? []) as Driver[];
}

export async function getDriver(sb: SB, id: string): Promise<Driver | null> {
  const { data } = await sb.from("drivers").select("*").eq("id", id).maybeSingle();
  return (data as Driver | null) ?? null;
}

export async function getSchedules(sb: SB): Promise<RentSchedule[]> {
  const { data, error } = await sb.from("rent_schedule").select("*").order("valid_from", { ascending: false });
  if (error) fail("rent_schedule", error);
  return ((data ?? []) as RentSchedule[]).map((r) => ({ ...r, weekly_rent_aoa: num(r.weekly_rent_aoa) }));
}

export async function getDowntime(sb: SB, vehicleId?: string): Promise<VehicleDowntime[]> {
  let q = sb.from("vehicle_downtime").select("*").order("from_date", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) fail("vehicle_downtime", error);
  return (data ?? []) as VehicleDowntime[];
}

export async function getTargets(sb: SB): Promise<FleetTargets & { updated_at: string }> {
  const { data, error } = await sb.from("fleet_targets").select("*").eq("id", 1).single();
  if (error) fail("fleet_targets", error);
  const t = data as FleetTargetsRow;
  return {
    net_per_car_month_aoa: num(t.net_per_car_month_aoa),
    free_cash_per_car_month_aoa: num(t.free_cash_per_car_month_aoa),
    reserve_rate_aoa_month: num(t.reserve_rate_aoa_month),
    inflation_rate_yearly: num(t.inflation_rate_yearly),
    reserve_base_year: t.reserve_base_year,
    car4_purchase_date: t.car4_purchase_date,
    car4_private_injection_aoa: num(t.car4_private_injection_aoa),
    passive_income_goal_aoa_month: num(t.passive_income_goal_aoa_month),
    fleet_size_target_2026: t.fleet_size_target_2026,
    updated_at: t.updated_at,
  };
}

export async function getLatestCash(sb: SB): Promise<CashPosition | null> {
  const { data } = await sb.from("cash_positions").select("*").order("as_of", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { ...(data as CashPosition), cash_aoa: num((data as CashPosition).cash_aoa) };
}

export async function getScoreWeights(sb: SB): Promise<ScoreWeights> {
  const { data, error } = await sb.from("score_weights").select("*").eq("id", 1).single();
  if (error) fail("score_weights", error);
  const w = data as ScoreWeightsRow;
  return {
    on_time_pct: num(w.on_time_pct), shortfall_pct: num(w.shortfall_pct), incidents_pct: num(w.incidents_pct),
    downtime_pct: num(w.downtime_pct), min_weeks: w.min_weeks, window_weeks: w.window_weeks,
  };
}

export async function getProfiles(sb: SB): Promise<Profile[]> {
  const { data, error } = await sb.from("profiles").select("*").order("created_at");
  if (error) fail("profiles", error);
  return (data ?? []) as Profile[];
}
