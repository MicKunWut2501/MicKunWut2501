import "server-only";
import type { SB } from "./fleet";
import { getLatestCash, getTargets, getVehicles } from "./fleet";
import { aggregateFleet, car4Countdown, computeVehicleMonth, type FleetMonth, type FleetTargets, type VehicleMonthResult } from "@/lib/model/model";
import type { VehicleMonthFactRow } from "@/lib/supabase/types";
import { num } from "@/lib/supabase/types";
import { luandaToday, monthStartOf } from "@/lib/time";

export type ModelVsActual = {
  today: string;
  targets: FleetTargets;
  vehicleMonths: VehicleMonthResult[];
  fleetMonths: FleetMonth[];
  thisMonth: FleetMonth | null;
  lastFullMonth: FleetMonth | null;
  cash_on_hand_aoa: number;
  cash_as_of: string | null;
  car4: ReturnType<typeof car4Countdown>;
  goal_progress: number | null; // fleet net this month / passive income goal
};

export async function getVehicleMonthFacts(sb: SB, from: string, to: string): Promise<VehicleMonthFactRow[]> {
  const { data, error } = await sb.rpc("vehicle_month_facts", { p_from: from, p_to: to });
  if (error) throw new Error(`vehicle_month_facts: ${error.message}`);
  return ((data ?? []) as VehicleMonthFactRow[]).map((r) => ({
    ...r,
    rent_expected_aoa: num(r.rent_expected_aoa), rent_paid_aoa: num(r.rent_paid_aoa), expenses_aoa: num(r.expenses_aoa),
  }));
}

/** Everything the dashboard, the XLSX export and the weekly brief need, from the first active month until today. */
export async function getModelVsActual(sb: SB, today = luandaToday()): Promise<ModelVsActual> {
  const [targets, vehicles, cash] = await Promise.all([getTargets(sb), getVehicles(sb), getLatestCash(sb)]);
  const firstMonth = vehicles.length ? monthStartOf(vehicles.map((v) => v.in_service_from).sort()[0]) : monthStartOf(today);
  const facts = await getVehicleMonthFacts(sb, firstMonth, today);
  const vehicleMonths = facts.map((f) => computeVehicleMonth(f, targets));
  const fleetMonths = aggregateFleet(vehicleMonths, targets);
  const thisMonthKey = monthStartOf(today);
  const thisMonth = fleetMonths.find((m) => m.month === thisMonthKey) ?? null;
  const past = fleetMonths.filter((m) => m.month < thisMonthKey);
  const lastFullMonth = past.length ? past[past.length - 1] : null;
  const reserveBalance = fleetMonths.length ? fleetMonths[fleetMonths.length - 1].cum_reserve_aoa : 0;
  const car4 = car4Countdown({
    today, purchaseDate: targets.car4_purchase_date, injectionAoa: targets.car4_private_injection_aoa,
    reserveBalanceAoa: reserveBalance, cashOnHandAoa: cash?.cash_aoa ?? 0,
  });
  return {
    today, targets, vehicleMonths, fleetMonths, thisMonth, lastFullMonth,
    cash_on_hand_aoa: cash?.cash_aoa ?? 0, cash_as_of: cash?.as_of ?? null, car4,
    goal_progress: thisMonth && targets.passive_income_goal_aoa_month > 0 ? thisMonth.net_aoa / targets.passive_income_goal_aoa_month : null,
  };
}
