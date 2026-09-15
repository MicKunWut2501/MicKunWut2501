/**
 * Planning model vs actuals. Pure functions; all inputs come from SQL (vehicle_month_facts, fleet_targets).
 *
 * Rules
 * - Everything is per vehicle per calendar month, pro-rated by active days (days in service / days in month).
 * - net              = rent paid - expenses (maintenance_events) for the month
 * - target_net       = net_per_car_month_aoa * prorate
 * - reserve rate     = reserve_rate_aoa_month * (1 + inflation)^(year - base_year)   (stepped yearly)
 * - target_reserve   = reserve rate * prorate                              (what the model puts aside)
 * - reserve (actual) = clamp(net, 0, target_reserve)                       (you can only reserve what you netted)
 * - free_cash        = net - reserve ; target_free_cash = target_net - target_reserve
 */

export type FleetTargets = {
  net_per_car_month_aoa: number;
  free_cash_per_car_month_aoa: number;
  reserve_rate_aoa_month: number;
  inflation_rate_yearly: number;
  reserve_base_year: number;
  car4_purchase_date: string;
  car4_private_injection_aoa: number;
  passive_income_goal_aoa_month: number;
  fleet_size_target_2026: number;
};

export type VehicleMonthFact = {
  vehicle_id: string;
  plate: string;
  month: string; // YYYY-MM-01
  days_in_month: number;
  active_days: number;
  downtime_days: number;
  rent_expected_aoa: number;
  rent_paid_aoa: number;
  expenses_aoa: number;
};

export type VehicleMonthResult = VehicleMonthFact & {
  prorate: number;
  net_aoa: number;
  target_net_aoa: number;
  reserve_rate_aoa: number;
  target_reserve_aoa: number;
  reserve_aoa: number;
  free_cash_aoa: number;
  target_free_cash_aoa: number;
  collection_rate: number | null;
};

export type FleetMonth = {
  month: string;
  vehicles: number;
  car_equivalents: number; // sum of prorate
  rent_expected_aoa: number;
  rent_paid_aoa: number;
  expenses_aoa: number;
  net_aoa: number;
  target_net_aoa: number;
  net_per_car_aoa: number | null;
  target_net_per_car_aoa: number;
  reserve_aoa: number;
  target_reserve_aoa: number;
  free_cash_aoa: number;
  target_free_cash_aoa: number;
  collection_rate: number | null;
  cum_reserve_aoa: number;
  cum_target_reserve_aoa: number;
};

const round0 = (n: number) => Math.round(n);

export function proRate(fact: Pick<VehicleMonthFact, "active_days" | "days_in_month">): number {
  if (fact.days_in_month <= 0) return 0;
  return Math.min(1, Math.max(0, fact.active_days / fact.days_in_month));
}

/** Reserve rate for a month, inflation-adjusted once per calendar year from the base year. */
export function reserveRateForMonth(t: FleetTargets, month: string): number {
  const year = Number(month.slice(0, 4));
  const years = year - t.reserve_base_year;
  const factor = years > 0 ? Math.pow(1 + t.inflation_rate_yearly, years) : 1;
  return round0(t.reserve_rate_aoa_month * factor);
}

export function collectionRate(expected: number, paid: number): number | null {
  if (expected <= 0) return null;
  return Math.min(1, paid / expected);
}

export function computeVehicleMonth(fact: VehicleMonthFact, t: FleetTargets): VehicleMonthResult {
  const prorate = proRate(fact);
  const net = round0(fact.rent_paid_aoa - fact.expenses_aoa);
  const targetNet = round0(t.net_per_car_month_aoa * prorate);
  const rate = reserveRateForMonth(t, fact.month);
  const targetReserve = round0(rate * prorate);
  const reserve = Math.max(0, Math.min(net, targetReserve));
  return {
    ...fact,
    prorate,
    net_aoa: net,
    target_net_aoa: targetNet,
    reserve_rate_aoa: rate,
    target_reserve_aoa: targetReserve,
    reserve_aoa: reserve,
    free_cash_aoa: net - reserve,
    target_free_cash_aoa: targetNet - targetReserve,
    collection_rate: collectionRate(fact.rent_expected_aoa, fact.rent_paid_aoa),
  };
}

/** Group per-vehicle results into fleet months (sorted), with cumulative reserve balances. */
export function aggregateFleet(results: VehicleMonthResult[], t: FleetTargets): FleetMonth[] {
  const byMonth = new Map<string, VehicleMonthResult[]>();
  for (const r of results) {
    const arr = byMonth.get(r.month) ?? [];
    arr.push(r);
    byMonth.set(r.month, arr);
  }
  const months = [...byMonth.keys()].sort();
  let cumReserve = 0;
  let cumTarget = 0;
  return months.map((month) => {
    const rows = byMonth.get(month)!;
    const sum = (f: (r: VehicleMonthResult) => number) => rows.reduce((a, r) => a + f(r), 0);
    const carEq = sum((r) => r.prorate);
    const net = sum((r) => r.net_aoa);
    const reserve = sum((r) => r.reserve_aoa);
    const targetReserve = sum((r) => r.target_reserve_aoa);
    cumReserve += reserve;
    cumTarget += targetReserve;
    const expected = sum((r) => r.rent_expected_aoa);
    const paid = sum((r) => r.rent_paid_aoa);
    return {
      month,
      vehicles: rows.length,
      car_equivalents: carEq,
      rent_expected_aoa: expected,
      rent_paid_aoa: paid,
      expenses_aoa: sum((r) => r.expenses_aoa),
      net_aoa: net,
      target_net_aoa: sum((r) => r.target_net_aoa),
      net_per_car_aoa: carEq > 0 ? round0(net / carEq) : null,
      target_net_per_car_aoa: t.net_per_car_month_aoa,
      reserve_aoa: reserve,
      target_reserve_aoa: targetReserve,
      free_cash_aoa: sum((r) => r.free_cash_aoa),
      target_free_cash_aoa: sum((r) => r.target_free_cash_aoa),
      collection_rate: collectionRate(expected, paid),
      cum_reserve_aoa: cumReserve,
      cum_target_reserve_aoa: cumTarget,
    };
  });
}

export type Car4Countdown = {
  purchase_date: string;
  days_remaining: number;
  months_remaining: number;
  days_after_months: number;
  reserve_balance_aoa: number;
  cash_on_hand_aoa: number;
  injection_target_aoa: number;
  injection_required_aoa: number;
};

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

/** Whole months + leftover days between today and the purchase date (0 if in the past). */
export function car4Countdown(i: {
  today: string;
  purchaseDate: string;
  injectionAoa: number;
  reserveBalanceAoa: number;
  cashOnHandAoa: number;
}): Car4Countdown {
  const [ty, tm, td] = ymd(i.today);
  const [py, pm, pd] = ymd(i.purchaseDate);
  const totalDays = Math.max(0, Math.round((Date.UTC(py, pm - 1, pd) - Date.UTC(ty, tm - 1, td)) / 86_400_000));
  let months = 0;
  let days = 0;
  if (totalDays > 0) {
    months = (py - ty) * 12 + (pm - tm);
    if (pd < td) months -= 1;
    const anchor = new Date(Date.UTC(ty, tm - 1 + months, td));
    days = Math.round((Date.UTC(py, pm - 1, pd) - anchor.getTime()) / 86_400_000);
    if (days < 0) {
      months -= 1;
      const a2 = new Date(Date.UTC(ty, tm - 1 + months, td));
      days = Math.round((Date.UTC(py, pm - 1, pd) - a2.getTime()) / 86_400_000);
    }
  }
  const required = Math.max(0, round0(i.injectionAoa - i.reserveBalanceAoa - i.cashOnHandAoa));
  return {
    purchase_date: i.purchaseDate,
    days_remaining: totalDays,
    months_remaining: Math.max(0, months),
    days_after_months: Math.max(0, days),
    reserve_balance_aoa: i.reserveBalanceAoa,
    cash_on_hand_aoa: i.cashOnHandAoa,
    injection_target_aoa: i.injectionAoa,
    injection_required_aoa: required,
  };
}

export function delta(actual: number | null, target: number): { abs: number | null; pct: number | null } {
  if (actual === null) return { abs: null, pct: null };
  const abs = actual - target;
  return { abs, pct: target !== 0 ? abs / target : null };
}
